import * as path from 'path';
import { ChildProcess, fork } from 'child_process';
import * as vscode from 'vscode';
import { TestAdapter, TestSuiteInfo, TestEvent, TestInfo, TestSuiteEvent, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent } from 'vscode-test-adapter-api';
import { Minimatch } from 'minimatch';
import { Log } from 'vscode-test-adapter-util';
import { MochaOptsReader } from './optsReader';

interface IDisposable {
	dispose(): void;
}

export class MochaAdapter implements TestAdapter, IDisposable {

	private static readonly reloadConfigKeys = [
		'mochaExplorer.files', 'mochaExplorer.cwd', 'mochaExplorer.env','mochaExplorer.ui',
		'mochaExplorer.require', 'mochaExplorer.nodePath', 'mochaExplorer.monkeyPatch'
	];
	private static readonly autorunConfigKeys = [
		'mochaExplorer.timeout', 'mochaExplorer.retries'
	];

	private optsReader: MochaOptsReader;

	private disposables: IDisposable[] = [];

	private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
	private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
	private readonly autorunEmitter = new vscode.EventEmitter<void>();

	private nodesById = new Map<string, TestSuiteInfo | TestInfo>();

	private runningTestProcess: ChildProcess | undefined;

	get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
		return this.testsEmitter.event;
	}

	get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> {
		return this.testStatesEmitter.event;
	}

	get autorun(): vscode.Event<void> {
		return this.autorunEmitter.event;
	}

	constructor(
		public readonly workspaceFolder: vscode.WorkspaceFolder,
		private readonly log: Log
	) {

		this.optsReader = new MochaOptsReader(workspaceFolder, log);

		this.disposables.push(this.testsEmitter);
		this.disposables.push(this.testStatesEmitter);
		this.disposables.push(this.autorunEmitter);

		this.disposables.push(vscode.workspace.onDidChangeConfiguration(configChange => {

			this.log.info('Configuration changed');

			for (const configKey of MochaAdapter.reloadConfigKeys) {
				if (configChange.affectsConfiguration(configKey, this.workspaceFolder.uri)) {
					if (this.log.enabled) this.log.info(`Sending reload event because ${configKey} changed`);
					this.load();
					return;
				}
			}

			for (const configKey of MochaAdapter.autorunConfigKeys) {
				if (configChange.affectsConfiguration(configKey, this.workspaceFolder.uri)) {
					if (this.log.enabled) this.log.info(`Sending autorun event because ${configKey} changed`);
					this.autorunEmitter.fire();
					return;
				}
			}
		}));

		this.disposables.push(vscode.workspace.onDidSaveTextDocument(document => {

			const filename = document.uri.fsPath;
			if (this.log.enabled) this.log.info(`${filename} was saved - checking if this affects ${this.workspaceFolder.uri.fsPath}`);
			const relativeGlob = this.optsReader.getTestFilesGlob(this.optsReader.getConfiguration());
			const absoluteGlob = path.resolve(this.workspaceFolder.uri.fsPath, relativeGlob);
			const matcher = new Minimatch(absoluteGlob);

			if (matcher.match(filename)) {
				if (this.log.enabled) this.log.info(`Sending reload event because ${filename} is a test file`);
				this.load();
			} else if (filename.startsWith(this.workspaceFolder.uri.fsPath)) {
				this.log.info('Sending autorun event');
				this.autorunEmitter.fire();
			}
		}));
	}

	async load(): Promise<void> {

		this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });

		if (this.log.enabled) this.log.info(`Loading test files of ${this.workspaceFolder.uri.fsPath}`);

		const config = this.optsReader.getConfiguration();
		const testFiles = await this.optsReader.lookupFiles(config);
		const mochaOpts = await this.optsReader.getMochaOpts(config);
		const execPath = await this.optsReader.getNodePath(config);
		const monkeyPatch = this.optsReader.getMonkeyPatch(config);

		let testsLoaded = false;

		await new Promise<void>(resolve => {

			const childProc = fork(
				require.resolve('./worker/loadTests.js'),
				[
					JSON.stringify(testFiles),
					JSON.stringify(mochaOpts),
					JSON.stringify(monkeyPatch),
					JSON.stringify(this.log.enabled)
				],
				{
					cwd: this.optsReader.getCwd(config),
					env: this.optsReader.getEnv(config),
					execPath,
					execArgv: [] // ['--inspect-brk=12345']
				}
			);

			childProc.on('message', (info: string | TestSuiteInfo | null) => {

				if (typeof info === 'string') {

					if (this.log.enabled) this.log.info(`Worker: ${info}`);

				} else {

					this.log.info('Received tests from worker');
					if (info) {
						info.id = `${this.workspaceFolder.uri.fsPath}: Mocha`;
						info.label = 'Mocha';
						this.nodesById.clear();
						this.collectNodesById(info);
					}
					testsLoaded = true;
					this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: info || undefined });
					resolve();
				}
			});

			childProc.on('exit', () => {
				this.log.info('Worker finished');
				if (!testsLoaded) {
					this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: undefined });
					resolve();
				}
			});

			childProc.on('error', err => {
				if (this.log.enabled) this.log.error(`Error from child process: ${err}`);
				if (!testsLoaded) {
					this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: undefined });
					resolve();
				}
			});
		});
	}

	async run(testsToRun: string[], execArgv: string[] = []): Promise<void> {

		if (this.log.enabled) this.log.info(`Running test(s) ${JSON.stringify(testsToRun)} of ${this.workspaceFolder.uri.fsPath}`);

		this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests: testsToRun });

		let tests: string[] = [];
		for (const suiteOrTestId of testsToRun) {
			const node = this.nodesById.get(suiteOrTestId);
			if (node) {
				this.collectTests(node, tests);
			}
		}
		tests = tests.map(test => {
			const separatorIndex = test.indexOf(': ');
			if (separatorIndex >= 0) {
				return test.substr(separatorIndex + 2);
			} else {
				return test;
			}
		});

		const config = this.optsReader.getConfiguration();
		const testFiles = await this.optsReader.lookupFiles(config);
		const mochaOpts = await this.optsReader.getMochaOpts(config);
		const execPath = await this.optsReader.getNodePath(config);

		let childProcessFinished = false;

		await new Promise<void>(resolve => {

			this.runningTestProcess = fork(
				require.resolve('./worker/runTests.js'),
				[ 
					JSON.stringify(testFiles),
					JSON.stringify(tests),
					JSON.stringify(mochaOpts),
					JSON.stringify(this.log.enabled)
				],
				{
					cwd: this.optsReader.getCwd(config),
					env: this.optsReader.getEnv(config),
					execPath,
					execArgv
				}
			);

			this.runningTestProcess.on('message', (message: string | TestSuiteEvent | TestEvent) => {

				if (typeof message === 'string') {

					if (this.log.enabled) this.log.info(`Worker: ${message}`);

				} else {

					if (this.log.enabled) this.log.info(`Received ${JSON.stringify(message)}`);
					this.testStatesEmitter.fire(message);
				}
			});

			this.runningTestProcess.on('exit', () => {
				this.log.info('Worker finished');
				this.runningTestProcess = undefined;
				if (!childProcessFinished) {
					childProcessFinished = true;
					this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
					resolve();
				}
			});

			this.runningTestProcess.on('error', err => {
				if (this.log.enabled) this.log.error(`Error from child process: ${err}`);
				this.runningTestProcess = undefined;
				if (!childProcessFinished) {
					childProcessFinished = true;
					this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
					resolve();
				}
			});
		});
	}

	async debug(testsToRun: string[]): Promise<void> {

		if (this.log.enabled) this.log.info(`Debugging test(s) ${JSON.stringify(testsToRun)} of ${this.workspaceFolder.uri.fsPath}`);

		const config = this.optsReader.getConfiguration();
		const debuggerPort = this.optsReader.getDebuggerPort(config);

		const testRunPromise = this.run(testsToRun, [ `--inspect-brk=${debuggerPort}` ]);

		this.log.info('Starting the debug session');
		const debugSessionStarted = await vscode.debug.startDebugging(this.workspaceFolder, {
			name: 'Debug Mocha Tests',
			type: 'node',
			request: 'attach',
			port: debuggerPort,
			protocol: 'inspector',
			timeout: 30000,
			stopOnEntry: false
		});

		if (!debugSessionStarted) {
			this.log.error('Failed starting the debug session - aborting');
			this.cancel();
			return;
		}

		const currentSession = vscode.debug.activeDebugSession;
		if (!currentSession) {
			this.log.error('No active debug session - aborting');
			this.cancel();
			return;
		}

		const subscription = vscode.debug.onDidTerminateDebugSession((session) => {
			if (currentSession != session) return;
			this.log.info('Debug session ended');
			this.cancel(); // terminate the test run
			subscription.dispose();
		});

		await testRunPromise;
	}

	cancel(): void {
		if (this.runningTestProcess) {
			this.log.info('Killing running test process');
			this.runningTestProcess.kill();
		}
	}

	dispose(): void {
		this.cancel();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
		this.nodesById.clear();
	}

	private collectNodesById(info: TestSuiteInfo | TestInfo): void {
		this.nodesById.set(info.id, info);
		if (info.type === 'suite') {
			for (const child of info.children) {
				this.collectNodesById(child);
			}
		}
	}

	private collectTests(info: TestSuiteInfo | TestInfo, tests: string[]): void {
		if (info.type === 'suite') {
			for (const child of info.children) {
				this.collectTests(child, tests);
			}
		} else {
			tests.push(info.id);
		}
	}
}

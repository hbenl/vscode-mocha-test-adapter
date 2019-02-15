import { ChildProcess, fork } from 'child_process';
import * as util from 'util';
import * as vscode from 'vscode';
import { TestAdapter, TestSuiteInfo, TestEvent, TestInfo, TestSuiteEvent, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { ConfigReader } from './configReader';
import { ErrorInfo, WorkerArgs } from './util';

export interface IDisposable {
	dispose(): void;
}

export class MochaAdapter implements TestAdapter, IDisposable {

	private configReader: ConfigReader;

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
		private readonly outputChannel: vscode.OutputChannel,
		private readonly log: Log
	) {

		this.configReader = new ConfigReader(workspaceFolder, () => this.load(), () => this.autorunEmitter.fire(), log);
		this.disposables.push(this.configReader);

		this.disposables.push(this.testsEmitter);
		this.disposables.push(this.testStatesEmitter);
		this.disposables.push(this.autorunEmitter);

	}

	async load(): Promise<void> {

		try {

			this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });

			if (this.log.enabled) this.log.info(`Loading test files of ${this.workspaceFolder.uri.fsPath}`);

			const config = await this.configReader.currentConfig;

			let testsLoaded = false;

			await new Promise<void>(resolve => {

				const childProc = fork(
					require.resolve('./worker/loadTests.js'),
					[],
					{
						cwd: config.cwd,
						env: config.env,
						execPath: config.nodePath,
						execArgv: [] // ['--inspect-brk=12345']
					}
				);

				childProc.send(JSON.stringify(<WorkerArgs>{
					testFiles: config.files,
					mochaPath: config.mochaPath,
					mochaOpts: config.mochaOpts,
					monkeyPatch: config.monkeyPatch,
					logEnabled: this.log.enabled
				}));

				childProc.on('message', (info: string | TestSuiteInfo | ErrorInfo | null) => {

					if (typeof info === 'string') {

						if (this.log.enabled) this.log.info(`Worker: ${info}`);

					} else {

						this.nodesById.clear();

						if (info) {

							if (info.type === 'suite') {

								this.log.info('Received tests from worker');
								info.id = `${this.workspaceFolder.uri.fsPath}: Mocha`;
								info.label = 'Mocha';
								this.collectNodesById(info);
								this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: info });

							} else { // info.type === 'error'

								this.log.info('Received error from worker');
								this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', errorMessage: info.errorMessage });

							}

						} else {

							this.log.info('Worker found no tests');
							this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished' });

						}

						testsLoaded = true;
						if (config.mochaOpts.exit) {
							childProc.kill();
						}
						resolve();
					}
				});

				childProc.on('close', () => {
					this.log.info('Worker finished');
					if (!testsLoaded) {
						this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: undefined });
						resolve();
					}
				});

				childProc.on('error', err => {
					if (this.log.enabled) this.log.error(`Error from child process: ${util.inspect(err)}`);
					if (!testsLoaded) {
						this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', errorMessage: err.stack });
						resolve();
					}
				});
			});

		} catch (err) {
			if (this.log.enabled) this.log.error(`Error while loading tests: ${util.inspect(err)}`);
			this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', errorMessage: err.stack });
		}
	}

	async run(testsToRun: string[], execArgv: string[] = []): Promise<void> {

		try {

			if (this.log.enabled) this.log.info(`Running test(s) ${JSON.stringify(testsToRun)} of ${this.workspaceFolder.uri.fsPath}`);

			this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests: testsToRun });

			const config = await this.configReader.currentConfig;

			const testInfos: TestInfo[] = [];
			for (const suiteOrTestId of testsToRun) {
				const node = this.nodesById.get(suiteOrTestId);
				if (node) {
					this.collectTests(node, testInfos);
				}
			}
			const tests = testInfos.map(test => {
				const separatorIndex = test.id.indexOf(': ');
				if (separatorIndex >= 0) {
					return test.id.substr(separatorIndex + 2);
				} else {
					return test.id;
				}
			});

			let testFiles: string[] | undefined = undefined;
			if (config.pruneFiles) {
				const testFileSet = new Set(testInfos.map(test => test.file).filter(file => (file !== undefined)));
				if (testFileSet.size > 0) {
					testFiles = <string[]>[ ...testFileSet ];
					if (this.log.enabled) this.log.debug(`Using test files ${JSON.stringify(testFiles)}`);
				}
			}
			if (testFiles === undefined) {
				testFiles = config.files;
			}

			let childProcessFinished = false;

			await new Promise<void>(resolve => {

				let runningTest: string | undefined = undefined;

				this.runningTestProcess = fork(
					require.resolve('./worker/runTests.js'),
					[],
					{
						cwd: config.cwd,
						env: config.env,
						execPath: config.nodePath,
						execArgv,
						stdio: [ 'pipe', 'pipe', 'pipe', 'ipc' ]
					}
				);

				this.runningTestProcess.send(JSON.stringify(<WorkerArgs>{
					testFiles,
					tests,
					mochaPath: config.mochaPath,
					mochaOpts: config.mochaOpts,
					logEnabled: this.log.enabled
				}));

				this.runningTestProcess.on('message', (message: string | TestSuiteEvent | TestEvent) => {

					if (typeof message === 'string') {

						if (this.log.enabled) this.log.info(`Worker: ${message}`);

					} else {

						if (this.log.enabled) this.log.info(`Received ${JSON.stringify(message)}`);

						this.testStatesEmitter.fire(message);

						if (message.type === 'test') {
							if (message.state === 'running') {
								runningTest = (typeof message.test === 'string') ? message.test : message.test.id;
							} else {
								runningTest = undefined;
							}
						}
					}
				});

				const processOutput = (data: Buffer | string) => {

					this.outputChannel.append(data.toString());

					if (runningTest) {
						this.testStatesEmitter.fire(<TestEvent>{
							type: 'test',
							state: 'running',
							test: runningTest,
							message: data.toString()
						});
					}
				}

				this.runningTestProcess.stdout.on('data', processOutput);
				this.runningTestProcess.stderr.on('data', processOutput);

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
					if (this.log.enabled) this.log.error(`Error from child process: ${util.inspect(err)}`);
					this.runningTestProcess = undefined;
					if (!childProcessFinished) {
						childProcessFinished = true;
						this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
						resolve();
					}
				});
			});

		} catch (err) {
			if (this.log.enabled) this.log.error(`Error while running tests: ${util.inspect(err)}`);
			this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
		}
	}

	async debug(testsToRun: string[]): Promise<void> {

		if (this.log.enabled) this.log.info(`Debugging test(s) ${JSON.stringify(testsToRun)} of ${this.workspaceFolder.uri.fsPath}`);

		const config = await this.configReader.currentConfig;

		const testRunPromise = this.run(testsToRun, [ `--inspect-brk=${config.debuggerPort}` ]);

		this.log.info('Starting the debug session');
		const debugSessionStarted = await vscode.debug.startDebugging(this.workspaceFolder, config.debuggerConfig || {
			name: 'Debug Mocha Tests',
			type: 'node',
			request: 'attach',
			port: config.debuggerPort,
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

	private collectTests(info: TestSuiteInfo | TestInfo, tests: TestInfo[]): void {
		if (info.type === 'suite') {
			for (const child of info.children) {
				this.collectTests(child, tests);
			}
		} else {
			tests.push(info);
		}
	}
}

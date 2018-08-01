import * as path from 'path';
import { ChildProcess, fork } from 'child_process';
import * as vscode from 'vscode';
import { TestAdapter, TestSuiteInfo, TestEvent, TestInfo, TestSuiteEvent } from 'vscode-test-adapter-api';
import { MochaOpts } from './opts';
import { Minimatch } from 'minimatch';
import { Log, detectNodePath } from 'vscode-test-adapter-util';

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

	private disposables: IDisposable[] = [];

	private readonly testStatesEmitter = new vscode.EventEmitter<TestSuiteEvent | TestEvent>();
	private readonly reloadEmitter = new vscode.EventEmitter<void>();
	private readonly autorunEmitter = new vscode.EventEmitter<void>();

	private runningTestProcess: ChildProcess | undefined;

	get testStates(): vscode.Event<TestSuiteEvent | TestEvent> {
		return this.testStatesEmitter.event;
	}

	get reload(): vscode.Event<void> {
		return this.reloadEmitter.event;
	}

	get autorun(): vscode.Event<void> {
		return this.autorunEmitter.event;
	}

	constructor(
		public readonly workspaceFolder: vscode.WorkspaceFolder,
		private readonly log: Log
	) {

		this.disposables.push(this.testStatesEmitter);
		this.disposables.push(this.reloadEmitter);
		this.disposables.push(this.autorunEmitter);

		this.disposables.push(vscode.workspace.onDidChangeConfiguration(configChange => {

			this.log.info('Configuration changed');

			for (const configKey of MochaAdapter.reloadConfigKeys) {
				if (configChange.affectsConfiguration(configKey, this.workspaceFolder.uri)) {
					if (this.log.enabled) this.log.info(`Sending reload event because ${configKey} changed`);
					this.reloadEmitter.fire();
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
			const relativeGlob = this.getTestFilesGlob(this.getConfiguration());
			const absoluteGlob = path.resolve(this.workspaceFolder.uri.fsPath, relativeGlob);
			const matcher = new Minimatch(absoluteGlob);

			if (matcher.match(filename)) {
				if (this.log.enabled) this.log.info(`Sending reload event because ${filename} is a test file`);
				this.reloadEmitter.fire();
			} else if (filename.startsWith(this.workspaceFolder.uri.fsPath)) {
				this.log.info('Sending autorun event');
				this.autorunEmitter.fire();
			}
		}));
	}

	async load(): Promise<TestSuiteInfo | undefined> {

		if (this.log.enabled) this.log.info(`Loading test files of ${this.workspaceFolder.uri.fsPath}`);

		const config = this.getConfiguration();
		const testFiles = await this.lookupFiles(config);
		const mochaOpts = this.getMochaOpts(config);
		const execPath = await this.getNodePath(config);
		const monkeyPatch = this.getMonkeyPatch(config);

		let testsLoaded = false;

		return await new Promise<TestSuiteInfo | undefined>((resolve, reject) => {

			const childProc = fork(
				require.resolve('./worker/loadTests.js'),
				[
					JSON.stringify(testFiles),
					JSON.stringify(mochaOpts),
					JSON.stringify(monkeyPatch),
					JSON.stringify(this.log.enabled)
				],
				{
					cwd: this.getCwd(config),
					env: this.getEnv(config),
					execPath,
					execArgv: [] // ['--inspect-brk=12345']
				}
			);

			childProc.on('message', (info: string | TestSuiteInfo | null) => {

				if (typeof info === 'string') {

					if (this.log.enabled) this.log.info(`Worker: ${info}`);

				} else {

					this.log.info('Received tests from worker');
					testsLoaded = true;
					resolve(info || undefined);
				}
			});

			childProc.on('exit', () => {
				this.log.info('Worker finished');
				if (!testsLoaded) {
					resolve(undefined);
				}
			});

			childProc.on('error', err => {
				if (this.log.enabled) this.log.error(`Error from child process: ${err}`);
				if (!testsLoaded) {
					resolve(undefined);
				}
			});
		});
	}

	async run(info: TestSuiteInfo | TestInfo, execArgv: string[] = []): Promise<void> {

		if (this.log.enabled) this.log.info(`Running test(s) "${info.id}" of ${this.workspaceFolder.uri.fsPath}`);

		const tests: string[] = [];
		this.collectTests(info, tests);

		const config = this.getConfiguration();
		const testFiles = await this.lookupFiles(config);
		const mochaOpts = this.getMochaOpts(config);
		const execPath = await this.getNodePath(config);

		let childProcessFinished = false;

		await new Promise<void>((resolve, reject) => {

			this.runningTestProcess = fork(
				require.resolve('./worker/runTests.js'),
				[ 
					JSON.stringify(testFiles),
					JSON.stringify(tests),
					JSON.stringify(mochaOpts),
					JSON.stringify(this.log.enabled)
				],
				{
					cwd: this.getCwd(config),
					env: this.getEnv(config),
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
					resolve();
				}
			});

			this.runningTestProcess.on('error', err => {
				if (this.log.enabled) this.log.error(`Error from child process: ${err}`);
				this.runningTestProcess = undefined;
				if (!childProcessFinished) {
					childProcessFinished = true;
					resolve();
				}
			});
		});
	}

	async debug(info: TestSuiteInfo | TestInfo): Promise<void> {

		if (this.log.enabled) this.log.info(`Debugging test(s) "${info.id}" of ${this.workspaceFolder.uri.fsPath}`);

		const tests: string[] = [];
		this.collectTests(info, tests);

		const config = this.getConfiguration();
		const debuggerPort = this.getDebuggerPort(config);

		const testRunPromise = this.run(info, [ `--inspect-brk=${debuggerPort}` ]);

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
	}

	private getConfiguration(): vscode.WorkspaceConfiguration {
		return vscode.workspace.getConfiguration('mochaExplorer', this.workspaceFolder.uri);
	}

	private getTestFilesGlob(config: vscode.WorkspaceConfiguration): string {
		return config.get<string>('files') || 'test/**/*.js';
	}

	private async lookupFiles(config: vscode.WorkspaceConfiguration): Promise<string[]> {

		const testFilesGlob = this.getTestFilesGlob(config);
		if (this.log.enabled) this.log.debug(`Looking for test files ${testFilesGlob} in ${this.workspaceFolder.uri.fsPath}`);
		const relativePattern = new vscode.RelativePattern(this.workspaceFolder, testFilesGlob);

		const fileUris = await vscode.workspace.findFiles(relativePattern);

		const testFiles = fileUris.map(uri => uri.fsPath);
		if (this.log.enabled) this.log.debug(`Found test files ${JSON.stringify(testFiles)}`);
		return testFiles;
	}

	private getEnv(config: vscode.WorkspaceConfiguration): object {

		const processEnv = process.env;
		const configEnv: { [prop: string]: any } = config.get('env') || {};

		if (this.log.enabled) this.log.debug(`Using environment variable config: ${JSON.stringify(configEnv)}`);

		const resultEnv = { ...processEnv };

		for (const prop in configEnv) {
			const val = configEnv[prop];
			if ((val === undefined) || (val === null)) {
				delete resultEnv.prop;
			} else {
				resultEnv[prop] = String(val);
			}
		}

		return resultEnv;
	}

	private getCwd(config: vscode.WorkspaceConfiguration): string {
		const dirname = this.workspaceFolder.uri.fsPath;
		const configCwd = config.get<string>('cwd');
		const cwd = configCwd ? path.resolve(dirname, configCwd) : dirname;
		if (this.log.enabled) this.log.debug(`Using working directory: ${cwd}`);
		return cwd;
	}

	private getMochaOpts(config: vscode.WorkspaceConfiguration): MochaOpts {

		let requires = config.get<string | string[]>('require');
		if (typeof requires === 'string') {
			if (requires.length > 0) {
				requires = [ requires ];
			} else {
				requires = [];
			}
		} else if (typeof requires === 'undefined') {
			requires = [];
		}

		const mochaOpts = {
			ui: config.get<string>('ui')!,
			timeout: config.get<number>('timeout')!,
			retries: config.get<number>('retries')!,
			requires,
			exit: config.get<boolean>('exit')!
		}

		if (this.log.enabled) this.log.debug(`Using Mocha options: ${JSON.stringify(mochaOpts)}`);

		return mochaOpts;
	}

	private async getNodePath(config: vscode.WorkspaceConfiguration): Promise<string | undefined> {
		let nodePath = config.get<string | null>('nodePath') || undefined;
		if (nodePath === 'default') {
			nodePath = await detectNodePath();
		}
		if (this.log.enabled) this.log.debug(`Using nodePath: ${nodePath}`);
		return nodePath;
	}

	private getMonkeyPatch(config: vscode.WorkspaceConfiguration): boolean {
		let monkeyPatch = config.get<boolean>('monkeyPatch');
		return (monkeyPatch !== undefined) ? monkeyPatch : true;
	}

	private getDebuggerPort(config: vscode.WorkspaceConfiguration): number {
		return config.get<number>('debuggerPort') || 9229;
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

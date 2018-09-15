import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, fork } from 'child_process';
import * as vscode from 'vscode';
import { TestAdapter, TestSuiteInfo, TestEvent, TestInfo, TestSuiteEvent, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent } from 'vscode-test-adapter-api';
import { MochaOpts } from './opts';
import { Minimatch } from 'minimatch';
import { Log, detectNodePath } from 'vscode-test-adapter-util';
import { copyOwnProperties } from './util';

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
			const relativeGlob = this.getTestFilesGlob(this.getConfiguration());
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

		const config = this.getConfiguration();
		const testFiles = await this.lookupFiles(config);
		const mochaOpts = await this.getMochaOpts(config);
		const execPath = await this.getNodePath(config);
		const monkeyPatch = this.getMonkeyPatch(config);

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

		const config = this.getConfiguration();
		const testFiles = await this.lookupFiles(config);
		const mochaOpts = await this.getMochaOpts(config);
		const execPath = await this.getNodePath(config);

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

		const config = this.getConfiguration();
		const debuggerPort = this.getDebuggerPort(config);

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

	private getEnv(config: vscode.WorkspaceConfiguration): NodeJS.ProcessEnv {

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

	private async readMochaOptsFile(file: string): Promise<Partial<MochaOpts>> {

		const resolvedFile = path.resolve(this.workspaceFolder.uri.fsPath, file);
		if (this.log.enabled) this.log.debug(`Looking for mocha options in ${resolvedFile}`);

		return new Promise<Partial<MochaOpts>>(resolve => {
			fs.readFile(resolvedFile, 'utf8', (err, data) => {

				if (err) {
					if (this.log.enabled) this.log.debug(`Couldn't read mocha.opts file: ${JSON.stringify(copyOwnProperties(err))}`);
					resolve({});
				}

				try {
					const opts = data
						.replace(/^#.*$/gm, '')
						.replace(/\\\s/g, '%20')
						.split(/\s/)
						.filter(Boolean)
						.map(value => value.replace(/%20/g, ' '));

					const ui = this.findOptValue(['-u', '--ui'], opts);
					const timeoutString = this.findOptValue(['-t', '--timeout'], opts);
					const timeout = timeoutString ? Number.parseInt(timeoutString) : undefined;
					const retriesString = this.findOptValue(['--retries'], opts);
					const retries = retriesString ? Number.parseInt(retriesString) : undefined;
					const requires = this.findOptValues(['-r', '--require'], opts);
					const exit = (opts.indexOf('--exit') >= 0) ? true : undefined;

					const mochaOpts = { ui, timeout, retries, requires, exit };
					if (this.log.enabled) this.log.debug(`Options from mocha.opts file: ${JSON.stringify(mochaOpts)}`);

					resolve(mochaOpts);

				} catch (err) {
					if (this.log.enabled) this.log.debug(`Couldn't parse mocha.opts file: ${JSON.stringify(copyOwnProperties(err))}`);
					resolve({});
				}
			});
		});
	}

	private findOptValue(needles: string[], haystack: string[]): string | undefined {

		let index: number | undefined;
		for (const needle of needles) {
			const needleIndex = haystack.lastIndexOf(needle);
			if ((needleIndex >= 0) && ((index === undefined) || (needleIndex > index))) {
				index = needleIndex;
			}
		}

		if ((index !== undefined) && (haystack.length > index + 1)) {
			return haystack[index + 1];
		} else {
			return undefined;
		}
	}

	private findOptValues(needles: string[], haystack: string[]): string[] {

		const values: string[] = [];

		for (let i = 0; i < haystack.length; i++) {
			if (needles.indexOf(haystack[i]) >= 0) {
				i++;
				if (i < haystack.length) {
					values.push(haystack[i]);
				}
			}
		}

		return values;
	}

	private async getMochaOpts(config: vscode.WorkspaceConfiguration): Promise<MochaOpts> {

		const mochaOptsFile = config.get<string>('optsFile')!;
		const mochaOptsFromFile = mochaOptsFile ? await this.readMochaOptsFile(mochaOptsFile) : {};

		let requires = this.mergeOpts<string | string[]>('require', mochaOptsFromFile.requires, config);
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
			ui: this.mergeOpts<string>('ui', mochaOptsFromFile.ui, config),
			timeout: this.mergeOpts<number>('timeout', mochaOptsFromFile.timeout, config),
			retries: this.mergeOpts<number>('retries', mochaOptsFromFile.retries, config),
			requires,
			exit: this.mergeOpts<boolean>('exit', mochaOptsFromFile.exit, config)
		}

		if (this.log.enabled) this.log.debug(`Using Mocha options: ${JSON.stringify(mochaOpts)}`);

		return mochaOpts;
	}

	private mergeOpts<T>(configKey: string, fileConfigValue: T | undefined, config: vscode.WorkspaceConfiguration): T {

		const vsCodeConfigValues = config.inspect<T>(configKey)!;

		if (vsCodeConfigValues.workspaceFolderValue !== undefined) {
			return vsCodeConfigValues.workspaceFolderValue;
		} else if (vsCodeConfigValues.workspaceValue !== undefined) {
			return vsCodeConfigValues.workspaceValue;
		} else if (vsCodeConfigValues.globalValue !== undefined) {
			return vsCodeConfigValues.globalValue;
		} else if (fileConfigValue !== undefined) {
			return fileConfigValue;
		} else {
			return vsCodeConfigValues.defaultValue!;
		}
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

import * as path from 'path';
import { ChildProcess, fork } from 'child_process';
import * as vscode from 'vscode';
import { TestAdapter, TestSuiteInfo, TestEvent, TestInfo, TestSuiteEvent } from 'vscode-test-adapter-api';
import { MochaOpts } from './opts';
import { Minimatch } from 'minimatch';

export class MochaAdapter implements TestAdapter {

	private static readonly reloadConfigKeys = [
		'mochaExplorer.files', 'mochaExplorer.cwd', 'mochaExplorer.env','mochaExplorer.ui', 'mochaExplorer.require'
	];
	private static readonly autorunConfigKeys = [
		'mochaExplorer.timeout', 'mochaExplorer.retries'
	];

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
		public readonly workspaceFolder: vscode.WorkspaceFolder
	) {

		vscode.workspace.onDidChangeConfiguration(configChange => {

			for (const configKey of MochaAdapter.reloadConfigKeys) {
				if (configChange.affectsConfiguration(configKey, this.workspaceFolder.uri)) {
					this.reloadEmitter.fire();
					return;
				}
			}

			for (const configKey of MochaAdapter.autorunConfigKeys) {
				if (configChange.affectsConfiguration(configKey, this.workspaceFolder.uri)) {
					this.autorunEmitter.fire();
					return;
				}
			}
		});

		vscode.workspace.onDidSaveTextDocument(document => {

			const filename = document.uri.fsPath;
			const relativeGlob = this.getTestFilesGlob(this.getConfiguration());
			const absoluteGlob = path.resolve(this.workspaceFolder.uri.fsPath, relativeGlob);
			const matcher = new Minimatch(absoluteGlob);

			if (matcher.match(filename)) {
				this.reloadEmitter.fire();
			} else if (filename.startsWith(this.workspaceFolder.uri.fsPath)) {
				this.autorunEmitter.fire();
			}
		});
	}

	async load(): Promise<TestSuiteInfo | undefined> {

		const config = this.getConfiguration();
		const testFiles = await this.lookupFiles(config);
		const mochaOpts = this.getMochaOpts(config);

		let testsLoaded = false;

		return await new Promise<TestSuiteInfo | undefined>((resolve, reject) => {

			const childProc = fork(
				require.resolve('./worker/loadTests.js'),
				[ JSON.stringify(testFiles), JSON.stringify(mochaOpts) ],
				{
					cwd: this.getCwd(config),
					env: this.getEnv(config),
					execArgv: [] // ['--inspect-brk=12345']
				}
			);

			childProc.on('message', (info: TestSuiteInfo | undefined) => {
				testsLoaded = true;
				resolve(info);
			});

			childProc.on('exit', () => {
				if (!testsLoaded) {
					resolve(undefined);
				}
			});
		});
	}

	async run(info: TestSuiteInfo | TestInfo): Promise<void> {

		const tests: string[] = [];
		this.collectTests(info, tests);

		const config = this.getConfiguration();
		const testFiles = await this.lookupFiles(config);
		const mochaOpts = this.getMochaOpts(config);

		await new Promise<void>((resolve, reject) => {

			this.runningTestProcess = fork(
				require.resolve('./worker/runTests.js'),
				[ JSON.stringify(testFiles), JSON.stringify(tests), JSON.stringify(mochaOpts) ],
				{
					cwd: this.getCwd(config),
					env: this.getEnv(config),
					execArgv: []
				}
			);

			this.runningTestProcess.on('message',
				message => this.testStatesEmitter.fire(<TestSuiteEvent | TestEvent>message));

			this.runningTestProcess.on('exit', () => {
				this.runningTestProcess = undefined;
				resolve();
			});
		});
	}

	async debug(info: TestSuiteInfo | TestInfo): Promise<void> {

		const tests: string[] = [];
		this.collectTests(info, tests);

		const config = this.getConfiguration();
		const testFiles = await this.lookupFiles(config);
		const mochaOpts = this.getMochaOpts(config);

		vscode.debug.startDebugging(this.workspaceFolder, {
			name: 'Debug Mocha Tests',
			type: 'node',
			request: 'launch',
			program: require.resolve('./worker/runTests.js'),
			args: [ JSON.stringify(testFiles), JSON.stringify(tests), JSON.stringify(mochaOpts) ],
			cwd: this.getCwd(config),
			env: this.getEnv(config),
			stopOnEntry: false
		});
	}

	cancel(): void {
		if (this.runningTestProcess) {
			this.runningTestProcess.kill();
		}
	}

	private getConfiguration(): vscode.WorkspaceConfiguration {
		return vscode.workspace.getConfiguration('mochaExplorer', this.workspaceFolder.uri);
	}

	private getTestFilesGlob(config: vscode.WorkspaceConfiguration): string {
		return config.get<string>('files') || 'test/**/*.js';
	}

	private async lookupFiles(config: vscode.WorkspaceConfiguration): Promise<string[]> {
		const testFilesGlob = this.getTestFilesGlob(config);
		const relativePattern = new vscode.RelativePattern(this.workspaceFolder, testFilesGlob);
		const fileUris = await vscode.workspace.findFiles(relativePattern);
		return fileUris.map(uri => uri.fsPath);
	}

	private getEnv(config: vscode.WorkspaceConfiguration): object {

		const processEnv = process.env;
		const configEnv: { [prop: string]: any } = config.get('env') || {};

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
		return configCwd ? path.resolve(dirname, configCwd) : dirname;
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

		return {
			ui: config.get<string>('ui')!,
			timeout: config.get<number>('timeout')!,
			retries: config.get<number>('retries')!,
			requires,
			exit: config.get<boolean>('exit')!
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

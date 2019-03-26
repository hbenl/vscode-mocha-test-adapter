import * as path from 'path';
import * as vscode from 'vscode';
import { IDisposable, IConfigReader } from './core'; 
import { MochaOpts } from './opts';
import { MochaOptsReader, MochaOptsAndFiles } from './optsReader';
import { detectNodePath, Log } from 'vscode-test-adapter-util';
import { Minimatch } from 'minimatch';

export interface AdapterConfig {

	nodePath: string | undefined;
	mochaPath: string;
	cwd: string;
	env: NodeJS.ProcessEnv;

	monkeyPatch: boolean;
	pruneFiles: boolean;

	debuggerPort: number;
	debuggerConfig: string | undefined;

	mochaOpts: MochaOpts;
	files: string[];

	mochaOptsFile: string | undefined;
	globs: string[];
}

export class ConfigReader implements IConfigReader, IDisposable {

	private static readonly reloadConfigKeys = [
		'mochaExplorer.files', 'mochaExplorer.cwd', 'mochaExplorer.env', 'mochaExplorer.ui',
		'mochaExplorer.require', 'mochaExplorer.optsFile', 'mochaExplorer.nodePath',
		'mochaExplorer.mochaPath', 'mochaExplorer.monkeyPatch'
	];
	private static readonly autorunConfigKeys = [
		'mochaExplorer.timeout', 'mochaExplorer.retries', 'mochaExplorer.pruneFiles'
	];

	private disposables: IDisposable[] = [];

	private _currentConfig: Promise<AdapterConfig>;
	get currentConfig(): Promise<AdapterConfig> { return this._currentConfig; }

	constructor(
		private readonly workspaceFolder: vscode.WorkspaceFolder,
		load: () => void,
		retire: () => void,
		private readonly log: Log
	) {
		this._currentConfig = this.readConfig();

		this.disposables.push(vscode.workspace.onDidChangeConfiguration(configChange => {

			this.log.info('Configuration changed');

			for (const configKey of ConfigReader.reloadConfigKeys) {
				if (configChange.affectsConfiguration(configKey, this.workspaceFolder.uri)) {
					if (this.log.enabled) this.log.info(`Reloading because ${configKey} changed`);
					this._currentConfig = this.readConfig();
					load();
					return;
				}
			}

			for (const configKey of ConfigReader.autorunConfigKeys) {
				if (configChange.affectsConfiguration(configKey, this.workspaceFolder.uri)) {
					if (this.log.enabled) this.log.info(`Sending autorun event because ${configKey} changed`);
					retire();
					return;
				}
			}
		}));

		this.disposables.push(vscode.workspace.onDidSaveTextDocument(async document => {

			const filename = document.uri.fsPath;
			if (this.log.enabled) this.log.info(`${filename} was saved - checking if this affects ${this.workspaceFolder.uri.fsPath}`);

			if (await this.isTestFile(filename)) {
				if (this.log.enabled) this.log.info(`Reloading because ${filename} is a test file`);
				this._currentConfig = this.readConfig();
				load();
			} else if (filename.startsWith(this.workspaceFolder.uri.fsPath)) {
				this.log.info('Sending autorun event');
				retire();
			}
		}));
	}

	private async readConfig(): Promise<AdapterConfig> {

		const config = vscode.workspace.getConfiguration('mochaExplorer', this.workspaceFolder.uri);
		const cwd = this.getCwd(config);

		let optsFromFiles: MochaOptsAndFiles;
		const optsReader = new MochaOptsReader(this.log);
		const file = this.getMochaOptsFile(config);
		if (file) {

			const resolvedFile = path.resolve(this.workspaceFolder.uri.fsPath, file);
			optsFromFiles = await optsReader.readMochaOptsFile(resolvedFile);

		} else {

			optsFromFiles = await optsReader.readOptsUsingMocha(cwd);

		}

		const mochaOpts = await this.getMochaOpts(config, optsFromFiles.mochaOpts);

		return {
			nodePath: await this.getNodePath(config),
			mochaPath: this.getMochaPath(config),
			cwd,
			env: this.getEnv(config, mochaOpts),
			monkeyPatch: this.getMonkeyPatch(config),
			pruneFiles: this.getPruneFiles(config),
			debuggerPort: this.getDebuggerPort(config),
			debuggerConfig: this.getDebuggerConfig(config),
			mochaOpts,
			files: await this.lookupFiles(config, optsFromFiles.globs, optsFromFiles.files),
			mochaOptsFile: this.getMochaOptsFile(config),
			globs: this.getTestFilesGlobs(config, optsFromFiles.globs)
		}
	}

	private getMochaOptsFile(config: vscode.WorkspaceConfiguration): string | undefined {

		const configValues = config.inspect<string>('optsFile')!;

		if (configValues.workspaceFolderValue !== undefined) {
			return configValues.workspaceFolderValue;
		} else if (configValues.workspaceValue !== undefined) {
			return configValues.workspaceValue;
		} else if (configValues.globalValue !== undefined) {
			return configValues.globalValue;
		} else {
			return undefined;
		}
	}

	private getTestFilesGlobs(config: vscode.WorkspaceConfiguration, globsFromOptsFile: string[]): string[] {

		const globConfigValues = config.inspect<string>('files')!;
		const globFromConfig =
			globConfigValues.workspaceFolderValue ||
			globConfigValues.workspaceValue ||
			globConfigValues.globalValue; // ?

		if (globFromConfig) {
			return [ globFromConfig, ...globsFromOptsFile ];
		} else if (globsFromOptsFile.length > 0) {
			return globsFromOptsFile;
		} else {
			return [ globConfigValues.defaultValue! ]; // globalValue?
		}
	}

	private async lookupFiles(
		config: vscode.WorkspaceConfiguration,
		globsFromOptsFile: string[],
		filesFromOptsFile: string[]
	): Promise<string[]> {

		const globs = this.getTestFilesGlobs(config, globsFromOptsFile);
		if (this.log.enabled) this.log.debug(`Looking for test files ${JSON.stringify(globs)} in ${this.workspaceFolder.uri.fsPath}`);

		const testFiles: string[] = [];
		for (const testFilesGlob of globs) {
			const relativePattern = new vscode.RelativePattern(this.workspaceFolder, testFilesGlob);
			const fileUris = await vscode.workspace.findFiles(relativePattern);
			testFiles.push(...fileUris.map(uri => uri.fsPath));
		}

		const resolvedFilesFromOptsFile = filesFromOptsFile
			.map(file => path.resolve(this.workspaceFolder.uri.fsPath, file));

		if (this.log.enabled) {
			this.log.debug(`Found test files ${JSON.stringify(testFiles)}`);
			if (filesFromOptsFile.length > 0) {
				this.log.debug(`Adding files ${JSON.stringify(resolvedFilesFromOptsFile)}`);
			}
		}

		return resolvedFilesFromOptsFile.concat(testFiles);
	}

	private async isTestFile(absolutePath: string): Promise<boolean> {

		const config = await this.currentConfig;
		const optsFile = config.mochaOptsFile;
		if (optsFile) {
			const resolvedOptsFile = path.resolve(this.workspaceFolder.uri.fsPath, optsFile);
			if (absolutePath === resolvedOptsFile) {
				return true;
			}
		}

		const globs = config.globs;
		for (const relativeGlob of globs) {
			const absoluteGlob = path.resolve(this.workspaceFolder.uri.fsPath, relativeGlob);
			const matcher = new Minimatch(absoluteGlob);
			if (matcher.match(absolutePath)) {
				return true;
			}
		}

		for (const file of config.files) {
			const resolvedFile = path.resolve(this.workspaceFolder.uri.fsPath, file);
			if (absolutePath === resolvedFile) {
				return true;
			}
		}

		return false;
	}

	private getEnv(config: vscode.WorkspaceConfiguration, mochaOpts: MochaOpts): NodeJS.ProcessEnv {

		const processEnv = process.env;
		const configEnv: { [prop: string]: any } = config.get('env') || {};

		if (this.log.enabled) this.log.debug(`Using environment variable config: ${JSON.stringify(configEnv)}`);

		const resultEnv = { ...processEnv };

		// workaround for esm not working when mocha is loaded programmatically (see #12)
		if (mochaOpts.requires.indexOf('esm') >= 0) {
			resultEnv['NYC_ROOT_ID'] = '';
		}

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

	private async getMochaOpts(config: vscode.WorkspaceConfiguration, mochaOptsFromFile: Partial<MochaOpts>): Promise<MochaOpts> {

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

	private getMochaPath(config: vscode.WorkspaceConfiguration): string {
		let mochaPath = config.get<string | null>('mochaPath');
		if (mochaPath) {
			return path.resolve(this.workspaceFolder.uri.fsPath, mochaPath);
		} else {
			return require.resolve('mocha');
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

	private getDebuggerConfig(config: vscode.WorkspaceConfiguration): string | undefined {
		return config.get<string>('debuggerConfig') || undefined;
	}

	private getPruneFiles(config: vscode.WorkspaceConfiguration): boolean {
		return config.get<boolean>('pruneFiles') || false;
	}

	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}

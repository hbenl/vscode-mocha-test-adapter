import * as path from 'path';
import { readFile, fileExists } from './util';
import * as vscode from 'vscode';
import { Minimatch } from 'minimatch';
import { parse as dotenvParse } from 'dotenv';
import { detectNodePath, Log } from 'vscode-test-adapter-util';
import { IDisposable, IConfigReader } from './core';
import { MochaOpts } from './opts';
import { MochaOptsReader, MochaOptsAndFiles } from './optsReader';
import { configKeys, OnChange, configSection } from './configKeys';

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
	envFile: string | undefined;
	globs: string[];

	launcherScript: string | undefined;
}

export class ConfigReader implements IConfigReader, IDisposable {

	private disposables: IDisposable[] = [];

	private enabledStateKey: string;

	private _currentConfig: Promise<AdapterConfig | undefined> | undefined;
	get currentConfig(): Promise<AdapterConfig | undefined> {
		if (this._currentConfig === undefined) {
			this._currentConfig = this.readConfig();
		}
		return this._currentConfig;
	}

	constructor(
		private readonly workspaceFolder: vscode.WorkspaceFolder,
		private readonly workspaceState: vscode.Memento,
		load: (changedFiles?: string[]) => Promise<void>,
		retire: (tests?: string[]) => void,
		private readonly log: Log
	) {

		this.enabledStateKey = `enable ${this.workspaceFolder.uri.fsPath}`;

		this.disposables.push(vscode.workspace.onDidChangeConfiguration(configChange => {

			this.log.info('Configuration changed');

			let configKey: string | undefined;

			if (configKey = this.configChangeRequires(configChange, 'reloadTests')) {
				if (this.log.enabled) this.log.info(`Reloading because ${configKey} changed`);
				load();
				return;
			}

			if (configKey = this.configChangeRequires(configChange, 'retire')) {
				if (this.log.enabled) this.log.info(`Sending autorun event because ${configKey} changed`);
				this.reloadConfig();
				retire();
				return;
			}

			if (configKey = this.configChangeRequires(configChange, 'reloadConfig')) {
				if (this.log.enabled) this.log.info(`Reloading configuration because ${configKey} changed`);
				this.reloadConfig();
				return;
			}
		}));

		this.disposables.push(vscode.workspace.onDidSaveTextDocument(async document => {

			const filename = document.uri.fsPath;
			if (this.log.enabled) this.log.info(`${filename} was saved - checking if this affects ${this.workspaceFolder.uri.fsPath}`);

			const isTestFile = await this.isTestFile(filename);
			if (isTestFile) {

				if (this.log.enabled) this.log.info(`Reloading because ${filename} is a test file`);
				
				if (isTestFile === 'config') {
					load();
				} else {
					load([ filename ]);
				}

			} else if (filename.startsWith(this.workspaceFolder.uri.fsPath)) {
				this.log.info('Sending autorun event');
				retire();
			}
		}));
	}

	reloadConfig(): void {
		this._currentConfig = this.readConfig();
	}

	async enableAdapter(): Promise<void> {
		await this.workspaceState.update(this.enabledStateKey, true);
	}

	async disableAdapter(): Promise<void> {
		await this.workspaceState.update(this.enabledStateKey, false);
	}

	private async readConfig(): Promise<AdapterConfig | undefined> {

		const config = vscode.workspace.getConfiguration(configSection, this.workspaceFolder.uri);

		if (!await this.checkEnabled(config)) {
			return undefined;
		}

		const cwd = this.getCwd(config);

		let optsFromFiles: MochaOptsAndFiles;
		const optsReader = new MochaOptsReader(this.log);
		let mochaOptsFile = this.getMochaOptsFile(config);
		if (mochaOptsFile) {

			const resolvedFile = path.resolve(this.workspaceFolder.uri.fsPath, mochaOptsFile);
			optsFromFiles = await optsReader.readMochaOptsFile(resolvedFile);

		} else {

			optsFromFiles = await optsReader.readOptsUsingMocha(cwd);
			mochaOptsFile = 'test/mocha.opts';

		}

		const mochaOpts = await this.getMochaOpts(config, optsFromFiles.mochaOpts);

		const envFile = this.getEnvFile(config);

		return {
			nodePath: await this.getNodePath(config),
			mochaPath: this.getMochaPath(config),
			cwd,
			env: await this.getEnv(config, mochaOpts),
			monkeyPatch: this.getMonkeyPatch(config),
			pruneFiles: this.getPruneFiles(config),
			debuggerPort: this.getDebuggerPort(config),
			debuggerConfig: this.getDebuggerConfig(config),
			mochaOpts,
			files: await this.lookupFiles(config, optsFromFiles.globs, optsFromFiles.files),
			mochaOptsFile,
			envFile,
			globs: this.getTestFilesGlobs(config, optsFromFiles.globs),
			launcherScript: this.getLauncherScript(config)
		}
	}

	private async checkEnabled(config: vscode.WorkspaceConfiguration): Promise<boolean> {

		if (this.workspaceFolder.uri.scheme !== 'file') {
			return false;
		}

		const enabledState = this.workspaceState.get<boolean>(this.enabledStateKey);
		if (enabledState !== undefined) {
			return enabledState;
		}

		for (const configKey in configKeys) {
			const configValues = config.inspect(configKey);
			if (configValues && (configValues.workspaceFolderValue !== undefined)) {
				await this.enableAdapter();
				return true;
			}
		}

		for (const configFile of [ '.mocharc.js', '.mocharc.json', '.mocharc.yaml', '.mocharc.yml', 'test/mocha.opts' ]) {
			const resolvedConfigFile = path.resolve(this.workspaceFolder.uri.fsPath, configFile);
			if (await fileExists(resolvedConfigFile)) {
				await this.enableAdapter();
				return true;
			}
		}

		try {
			const packageJson = JSON.parse(await readFile(path.resolve(this.workspaceFolder.uri.fsPath, 'package.json')));
			if (packageJson.mocha ||
				(packageJson.dependencies && packageJson.dependencies.mocha) ||
				(packageJson.devDependencies && packageJson.devDependencies.mocha)) {
				await this.enableAdapter();
				return true;
			}
		} catch (err) {
		}

		const relativePattern = new vscode.RelativePattern(this.workspaceFolder, 'test/**/*.js');
		const fileUris = await vscode.workspace.findFiles(relativePattern);
		if (fileUris.length > 0) {

			let msg = `The workspace folder ${this.workspaceFolder.name} contains test files, but I'm not sure if they should be run using Mocha. `;
			msg += 'Do you want to enable Mocha Test Explorer for this workspace folder?';
			const userChoice = await vscode.window.showInformationMessage(msg, 'Enable', 'Disable');

			if (userChoice === 'Enable') {
				await this.enableAdapter();
				return true;
			} else if (userChoice === 'Disable') {
				await this.disableAdapter();
				return false;
			}
		}

		return false;
	}

	private getMochaOptsFile(config: vscode.WorkspaceConfiguration): string | undefined {

		const configValues = config.inspect<string>(configKeys.optsFile.key)!;

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

		const globConfigValues = config.inspect<string | string[]>(configKeys.files.key)!;
		let globFromConfig =
			globConfigValues.workspaceFolderValue ||
			globConfigValues.workspaceValue ||
			globConfigValues.globalValue; // ?

		if (globFromConfig) {

			if (typeof globFromConfig === 'string') {
				globFromConfig = [ globFromConfig ];
			}

			return [ ...globFromConfig, ...globsFromOptsFile ];

		} else if (globsFromOptsFile.length > 0) {
			return globsFromOptsFile;
		} else {
			return [ globConfigValues.defaultValue as string ]; // globalValue?
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

	private async isTestFile(absolutePath: string): Promise<boolean | 'config'> {

		if (!absolutePath.startsWith(this.workspaceFolder.uri.fsPath)) {
			return false;
		}
		const settingsPath = path.resolve(this.workspaceFolder.uri.fsPath, '.vscode/settings.json');
		if (absolutePath === settingsPath) {
			return false;
		}

		for (const configFile of [ '.mocharc.js', '.mocharc.json', '.mocharc.yaml', '.mocharc.yml', 'package.json' ]) {
			const resolvedConfigFile = path.resolve(this.workspaceFolder.uri.fsPath, configFile);
			if (absolutePath === resolvedConfigFile) {
				return 'config';
			}
		}

		const config = await this.currentConfig;

		if (!config) {
			const testFolderPath = path.resolve(this.workspaceFolder.uri.fsPath, 'test');
			return absolutePath.startsWith(testFolderPath);
		}

		for (const configFile of [ config.mochaOptsFile, config.envFile, config.launcherScript ]) {
			if (configFile) {
				const resolvedConfigFile = path.resolve(this.workspaceFolder.uri.fsPath, configFile);
				if (absolutePath === resolvedConfigFile) {
					return 'config';
				}
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

	private async getEnv(config: vscode.WorkspaceConfiguration, mochaOpts: MochaOpts): Promise<NodeJS.ProcessEnv> {

		const processEnv = process.env;
		const configEnv: { [prop: string]: string } = config.get(configKeys.env.key) || {};
		if (this.log.enabled) this.log.debug(`Using environment variables from config: ${JSON.stringify(configEnv)}`);

		const envPath: string | undefined = config.get<string>(configKeys.envPath.key);
		if (envPath && this.log.enabled) this.log.debug(`Reading environment variables from ${envPath}`);

		let resultEnv = { ...processEnv };

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

		if (envPath) {
			const dotenvFile = await readFile(path.resolve(this.workspaceFolder.uri.fsPath, envPath));
			resultEnv = { ...dotenvParse(dotenvFile), ...resultEnv };
		}

		return resultEnv;
	}

	private getCwd(config: vscode.WorkspaceConfiguration): string {
		const dirname = this.workspaceFolder.uri.fsPath;
		const configCwd = config.get<string>(configKeys.cwd.key);
		const cwd = configCwd ? path.resolve(dirname, configCwd) : dirname;
		if (this.log.enabled) this.log.debug(`Using working directory: ${cwd}`);
		return cwd;
	}

	private async getMochaOpts(config: vscode.WorkspaceConfiguration, mochaOptsFromFile: Partial<MochaOpts>): Promise<MochaOpts> {

		let requires = this.mergeOpts<string | string[]>(configKeys.require.key, mochaOptsFromFile.requires, config);
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
			ui: this.mergeOpts<string>(configKeys.ui.key, mochaOptsFromFile.ui, config),
			timeout: this.mergeOpts<number>(configKeys.timeout.key, mochaOptsFromFile.timeout, config),
			retries: this.mergeOpts<number>(configKeys.retries.key, mochaOptsFromFile.retries, config),
			requires,
			exit: this.mergeOpts<boolean>(configKeys.exit.key, mochaOptsFromFile.exit, config)
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
		let mochaPath = config.get<string | null>(configKeys.mochaPath.key);
		if (mochaPath) {
			return path.resolve(this.workspaceFolder.uri.fsPath, mochaPath);
		} else {
			return path.dirname(require.resolve('mocha'));
		}
	}

	private async getNodePath(config: vscode.WorkspaceConfiguration): Promise<string | undefined> {
		let nodePath = config.get<string | null>(configKeys.nodePath.key) || undefined;
		if (nodePath === 'default') {
			nodePath = await detectNodePath();
		}
		if (this.log.enabled) this.log.debug(`Using nodePath: ${nodePath}`);
		return nodePath;
	}

	private getMonkeyPatch(config: vscode.WorkspaceConfiguration): boolean {
		let monkeyPatch = config.get<boolean>(configKeys.monkeyPatch.key);
		return (monkeyPatch !== undefined) ? monkeyPatch : true;
	}

	private getDebuggerPort(config: vscode.WorkspaceConfiguration): number {
		return config.get<number>(configKeys.debuggerPort.key) || 9229;
	}

	private getDebuggerConfig(config: vscode.WorkspaceConfiguration): string | undefined {
		return config.get<string>(configKeys.debuggerConfig.key) || undefined;
	}

	private getPruneFiles(config: vscode.WorkspaceConfiguration): boolean {
		return config.get<boolean>(configKeys.pruneFiles.key) || false;
	}

	private getEnvFile(config: vscode.WorkspaceConfiguration): string | undefined {
		return config.get<string>(configKeys.envPath.key) || undefined;
	}

	private getLauncherScript(config: vscode.WorkspaceConfiguration): string | undefined {
		return config.get<string>(configKeys.launcherScript.key) || undefined;
	}

	private configChangeRequires(configChange: vscode.ConfigurationChangeEvent, action: OnChange): string | undefined {

		for (const configKeyInfo of Object.values(configKeys)) {
			if ((configKeyInfo.onChange === action) && configChange.affectsConfiguration(configKeyInfo.fullKey, this.workspaceFolder.uri)) {
				return configKeyInfo.fullKey;
			}
		}

		return undefined;
	}

	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}

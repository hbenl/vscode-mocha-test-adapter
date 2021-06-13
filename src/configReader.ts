import * as path from 'path';
import fs from 'fs';
import { readFile, fileExists, normalizePath } from './util';
import * as vscode from 'vscode';
import { glob } from 'glob';
import minimatch from 'minimatch';
import { parse as dotenvParse } from 'dotenv';
import { detectNodePath, Log } from 'vscode-test-adapter-util';
import { IDisposable, IConfigReader } from './core';
import { MochaOpts } from 'vscode-test-adapter-remoting-util/out/mocha';
import { MochaOptsReader, MochaOptsAndFiles } from './optsReader';
import { configKeys, OnChange, configSection } from './configKeys';

export type EnvVars = { [envVar: string]: string | null };

export interface AdapterConfig {

	nodePath: string | undefined;
	mochaPath: string;
	cwd: string;
	env: EnvVars;

	monkeyPatch: boolean;
	multiFileSuites: boolean;
	pruneFiles: boolean;

	debuggerPort: number;
	debuggerConfig: string | undefined;

	mochaOpts: MochaOpts;
	testFiles: string[];
	extraFiles: string[];

	mochaConfigFile: string | undefined;
	packageFile: string | undefined;
	mochaOptsFile: string | undefined;
	envFile: string | undefined;
	globs: string[];
	ignores: string[];

	esmLoader: boolean;

	launcherScript: string | undefined;
	ipcRole: 'client' | 'server' | undefined;
	ipcPort: number;
	ipcHost: string | undefined;
	ipcTimeout: number;

	autoload: boolean | 'onStart';
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

		this.disposables.push(vscode.workspace.onDidChangeConfiguration(async configChange => {

			this.log.info('Configuration changed');

			let configKey: string | undefined;

			if (configKey = this.configChangeRequires(configChange, 'reloadTests')) {
				const config = await this.currentConfig;
				if (config?.autoload === true) {
					if (this.log.enabled) this.log.info(`Reloading tests because ${configKey} changed`);
					load();
				} else {
					if (this.log.enabled) this.log.info(`Reloading tests cancelled because the adapter or autoloading is disabled`);
					this.reloadConfig();
					retire();
				}
				return;
			}

			if (configKey = this.configChangeRequires(configChange, 'retire')) {
				if (this.log.enabled) this.log.info(`Sending retire event because ${configKey} changed`);
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

			const config = await this.currentConfig;
			if (config?.autoload !== true) {
				if (this.log.enabled) this.log.info(`Reloading cancelled because the adapter or autoloading is disabled`);
				return;
			}

			const filename = document.uri.fsPath;
			if (this.log.enabled) this.log.info(`${filename} was saved - checking if this affects ${this.workspaceFolder.uri.fsPath}`);

			const isTestFile = await this.isTestFile(filename);
			if (isTestFile) {

				if (this.log.enabled) this.log.info(`Reloading because ${filename} is a test file`);
				
				if (isTestFile === 'config') {
					load();
				} else {
					load([ normalizePath(filename) ]);
				}

			} else if (filename.startsWith(this.workspaceFolder.uri.fsPath)) {
				this.log.info('Sending retire event');
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

	getAutoload(config: vscode.WorkspaceConfiguration): boolean | 'onStart' {
		const autoload = config.get<boolean | 'onStart'>(configKeys.autoload.key);
		return (autoload !== undefined) ? autoload : true;
	}

	private async readConfig(): Promise<AdapterConfig | undefined> {

		const config = vscode.workspace.getConfiguration(configSection, this.workspaceFolder.uri);

		if (!await this.checkEnabled(config)) {
			return undefined;
		}

		const cwd = this.getCwd(config);
		const nodePath = await this.getNodePath(config);

		let optsFromFiles: MochaOptsAndFiles;
		const optsReader = new MochaOptsReader(this.log);
		const defaultMochaOptsFile = 'test/mocha.opts';
		let mochaOptsFile = this.getMochaOptsFile(config);
		let mochaConfigFile: string | undefined;
		let packageFile: string | undefined = 'package.json';
		if (!mochaOptsFile) {
			if (await fileExists(path.resolve(this.workspaceFolder.uri.fsPath, defaultMochaOptsFile))) {
				mochaOptsFile = defaultMochaOptsFile;
			}
		}
		if (mochaOptsFile) {

			const resolvedFile = path.resolve(this.workspaceFolder.uri.fsPath, mochaOptsFile);
			optsFromFiles = await optsReader.readMochaOptsFile(resolvedFile);

		} else {

			const argv: string[] = [];
			const configFile = this.getMochaConfigFile(config);
			if (configFile !== 'default') {
				if (configFile === null) {
					argv.push('--no-config');
				} else {
					mochaConfigFile = path.resolve(this.workspaceFolder.uri.fsPath, configFile);
					argv.push('--config', mochaConfigFile);
				}
			}
			const pkgFile = this.getPkgFile(config);
			if (pkgFile !== 'default') {
				if (pkgFile === null) {
					packageFile = undefined;
					argv.push('--no-package');
				} else {
					packageFile = path.resolve(this.workspaceFolder.uri.fsPath, pkgFile);
					argv.push('--package', packageFile);
				}
			}
			optsFromFiles = await optsReader.readOptsUsingMocha(cwd, nodePath, argv);

		}

		const mochaOpts = await this.getMochaOpts(config, optsFromFiles.mochaOpts);

		const envFile = this.getEnvFile(config);

		const testFiles = await this.lookupFiles(config, optsFromFiles.globs, optsFromFiles.ignores);

		const extraFiles = optsFromFiles.files
			.map(file => path.resolve(this.workspaceFolder.uri.fsPath, file));
		if (this.log.enabled && (extraFiles.length > 0)) {
			this.log.debug(`Adding files ${JSON.stringify(extraFiles)}`);
		}

		return {
			nodePath,
			mochaPath: await this.getMochaPath(config),
			cwd,
			env: await this.getEnv(config, mochaOpts),
			monkeyPatch: this.getMonkeyPatch(config),
			multiFileSuites: this.getMultiFileSuites(config),
			pruneFiles: this.getPruneFiles(config),
			debuggerPort: this.getDebuggerPort(config),
			debuggerConfig: this.getDebuggerConfig(config),
			mochaOpts,
			testFiles,
			extraFiles,
			mochaConfigFile,
			packageFile,
			mochaOptsFile,
			envFile,
			globs: this.getTestFilesGlobs(config, optsFromFiles.globs),
			ignores: this.getIgnores(config, optsFromFiles.ignores),
			esmLoader: this.getEsmLoader(config),
			launcherScript: this.getLauncherScript(config),
			ipcRole: this.getIpcRole(config),
			ipcPort: this.getIpcPort(config),
			ipcHost: this.getIpcHost(config),
			ipcTimeout: this.getIpcTimeout(config),
			autoload: this.getAutoload(config)
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

		const filePaths = await this.globFiles(config, 'test/**/*.js');
		if (filePaths.length > 0) {

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

	private getMochaConfigFile(config: vscode.WorkspaceConfiguration): string | null {
		return config.get<string | null>(configKeys.configFile.key) || null;
	}

	private getPkgFile(config: vscode.WorkspaceConfiguration): string | null {
		return config.get<string | null>(configKeys.pkgFile.key) || null;
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

	private getIgnores(config: vscode.WorkspaceConfiguration, ignoresFromOptsFile: string[]): string[] {

		let ignoresFromConfig = config.get<string | string[]>(configKeys.ignore.key) || [];

		if (typeof ignoresFromConfig === 'string') {
			ignoresFromConfig = [ ignoresFromConfig ];
		}

		return [ ...ignoresFromConfig, ...ignoresFromOptsFile ];
	}

	private async lookupFiles(
		config: vscode.WorkspaceConfiguration,
		globsFromOptsFile: string[],
		ignoresFromOptsFile: string[]
	): Promise<string[]> {

		const globs = this.getTestFilesGlobs(config, globsFromOptsFile);
		const ignores = this.getIgnores(config, ignoresFromOptsFile);
		if (this.log.enabled) this.log.debug(`Looking for test files ${JSON.stringify(globs)} in ${this.workspaceFolder.uri.fsPath}`);

		const testFiles: string[] = [];
		for (let testFilesGlob of globs) {
			for (const path of await this.globFiles(config, testFilesGlob)) {
				if (ignores.every(ignore => !this.absolutePathMatchesRelativeGlob(path, ignore))) {
					testFiles.push(path);
				}
			}
		}

		if (this.log.enabled) {
			this.log.debug(`Found test files ${JSON.stringify(testFiles)}`);
		}

		return testFiles;
	}

	private async globFiles(config: vscode.WorkspaceConfiguration, relativeGlob: string) {
		if (this.getGlobImplementation(config) === 'glob') {

			const absoluteGlob = normalizePath(path.resolve(this.workspaceFolder.uri.fsPath, relativeGlob));
			return await new Promise<string[]>(
				(resolve, reject) => glob(
					absoluteGlob,
					{ nodir: true },
					(err, matches) => {
						if (err) {
							reject(err);
						} else {
							resolve(matches.map(normalizePath));
						}
					}
			));

		} else {

			if (relativeGlob.startsWith('./')) {
				relativeGlob = relativeGlob.substring(2);
			}
			const relativePattern = new vscode.RelativePattern(this.workspaceFolder, relativeGlob);
			const fileUris = await vscode.workspace.findFiles(relativePattern, null);
			return fileUris.map(uri => normalizePath(uri.fsPath));
		}
	}

	private absolutePathMatchesRelativeGlob(absolutePath: string, relativeGlob: string): boolean {
		absolutePath = normalizePath(absolutePath);
		const absoluteGlob = normalizePath(path.resolve(this.workspaceFolder.uri.fsPath, relativeGlob));
		return minimatch(absolutePath, absoluteGlob);
	}

	private async isTestFile(absolutePath: string): Promise<boolean | 'config'> {
		absolutePath = normalizePath(absolutePath);

		if (!absolutePath.startsWith(normalizePath(this.workspaceFolder.uri.fsPath))) {
			return false;
		}
		const settingsPath = normalizePath(path.resolve(this.workspaceFolder.uri.fsPath, '.vscode/settings.json'));
		if (absolutePath === settingsPath) {
			return false;
		}

		const config = await this.currentConfig;

		if (!config?.mochaConfigFile) {
			for (const configFile of [ '.mocharc.js', '.mocharc.json', '.mocharc.yaml', '.mocharc.yml' ]) {
				const resolvedConfigFile = path.resolve(this.workspaceFolder.uri.fsPath, configFile);
				if (absolutePath === resolvedConfigFile) {
					return 'config';
				}
			}
		}

		if (!config) {
			const testFolderPath = normalizePath(path.resolve(this.workspaceFolder.uri.fsPath, 'test'));
			return absolutePath.startsWith(testFolderPath);
		}

		for (const configFile of [ config.mochaConfigFile, config.packageFile, config.mochaOptsFile, config.envFile, config.launcherScript ]) {
			if (configFile) {
				const resolvedConfigFile = normalizePath(path.resolve(this.workspaceFolder.uri.fsPath, configFile));
				if (absolutePath === resolvedConfigFile) {
					return 'config';
				}
			}
		}

		const globs = config.globs;
		for (const relativeGlob of globs) {
			const absoluteGlob = normalizePath(path.resolve(this.workspaceFolder.uri.fsPath, relativeGlob));
			if (minimatch(absolutePath, absoluteGlob) &&
				config.ignores.every(ignore => !this.absolutePathMatchesRelativeGlob(absolutePath, ignore))) {
				return true;
			}
		}

		for (const file of config.extraFiles) {
			if (absolutePath === file) {
				return true;
			}
		}

		return false;
	}

	private async getEnv(config: vscode.WorkspaceConfiguration, mochaOpts: MochaOpts): Promise<EnvVars> {

		let resultEnv: EnvVars = config.get(configKeys.env.key) || {};
		if (this.log.enabled) this.log.debug(`Using environment variables from config: ${JSON.stringify(resultEnv)}`);

		let envPath: string | undefined = config.get<string>(configKeys.envPath.key);
		if (envPath) {

			envPath = path.resolve(this.workspaceFolder.uri.fsPath, envPath);
			if (this.log.enabled) this.log.debug(`Reading environment variables from ${envPath}`);

			try {

				const dotenvFile = await readFile(envPath);
				resultEnv = { ...dotenvParse(dotenvFile), ...resultEnv };

			} catch (e) {
				const envPathSettings = config.inspect<string>(configKeys.envPath.key);
				if (envPathSettings?.workspaceFolderValue || envPathSettings?.workspaceValue) {
					throw e;
				} else {
					if (this.log.enabled) this.log.info(`Ignoring globally configured envPath because ${envPath} can't be read`);
				}
			}
		}

		// workaround for esm not working when mocha is loaded programmatically (see #12)
		if ((mochaOpts.requires.indexOf('esm') >= 0) && !resultEnv.hasOwnProperty('NYC_ROOT_ID')) {
			resultEnv['NYC_ROOT_ID'] = '';
		}

		return resultEnv;
	}

	private getCwd(config: vscode.WorkspaceConfiguration): string {
		const dirname = normalizePath(this.workspaceFolder.uri.fsPath);
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
			delay: this.mergeOpts<boolean>(configKeys.delay.key, mochaOptsFromFile.delay, config),
			fullTrace: this.mergeOpts<boolean>(configKeys.fullTrace.key, mochaOptsFromFile.fullTrace, config),
			exit: this.mergeOpts<boolean>(configKeys.exit.key, mochaOptsFromFile.exit, config),
			asyncOnly: this.mergeOpts<boolean>(configKeys.asyncOnly.key, mochaOptsFromFile.asyncOnly, config),
			parallel: this.mergeOpts<boolean>(configKeys.parallel.key, mochaOptsFromFile.parallel, config),
			jobs: this.mergeOpts<number | null>(configKeys.jobs.key, mochaOptsFromFile.jobs, config) || undefined
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

	private async getMochaPath(config: vscode.WorkspaceConfiguration): Promise<string> {

		const configuredMochaPath = config.get<string | null>(configKeys.mochaPath.key);

		if (configuredMochaPath === 'default') {

			const localMochaPath = path.resolve(this.workspaceFolder.uri.fsPath, 'node_modules/mocha');
			const hasLocalMocha = await new Promise<boolean>(resolve => {
				fs.stat(localMochaPath, (err, stats) => {
					resolve(!err && stats.isDirectory());
				});
			});

			if (hasLocalMocha) {
				return localMochaPath;
			}

		} else if (configuredMochaPath) {

			return path.resolve(this.workspaceFolder.uri.fsPath, configuredMochaPath);

		}

		return path.dirname(require.resolve('mocha'));
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

	private getMultiFileSuites(config: vscode.WorkspaceConfiguration): boolean {
		return config.get<boolean>(configKeys.multiFileSuites.key) || false;
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

	private getEsmLoader(config: vscode.WorkspaceConfiguration): boolean {
		const esmLoader = config.get<boolean>(configKeys.esmLoader.key);
		return (esmLoader !== undefined) ? esmLoader : true;
	}

	private getEnvFile(config: vscode.WorkspaceConfiguration): string | undefined {
		return config.get<string>(configKeys.envPath.key) || undefined;
	}

	private getGlobImplementation(config: vscode.WorkspaceConfiguration): 'glob' | 'vscode' {
		return config.get<'glob' | 'vscode'>(configKeys.globImplementation.key) || 'glob';
	}

	private getLauncherScript(config: vscode.WorkspaceConfiguration): string | undefined {
		return config.get<string>(configKeys.launcherScript.key) || undefined;
	}

	private getIpcRole(config: vscode.WorkspaceConfiguration): 'client' | 'server' | undefined {
		return config.get<'client' | 'server' | null>('ipcRole') || undefined;
	}

	private getIpcPort(config: vscode.WorkspaceConfiguration): number {
		return config.get<number>('ipcPort') || 9449;
	}

	private getIpcHost(config: vscode.WorkspaceConfiguration): string | undefined {
		return config.get<string | null>('ipcHost') || undefined;
	}

	private getIpcTimeout(config: vscode.WorkspaceConfiguration): number {
		return config.get<number>('ipcTimeout') || 5000;
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

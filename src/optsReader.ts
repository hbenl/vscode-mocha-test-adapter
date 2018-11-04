import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { MochaOpts } from 'vscode-test-adapter-remoting-util/out/mocha';
import { detectNodePath, Log } from 'vscode-test-adapter-util';
import { copyOwnProperties } from './util';

export class MochaOptsReader {

	constructor(
		private readonly workspaceFolder: vscode.WorkspaceFolder,
		private readonly log: Log
	) {}

	getConfiguration(): vscode.WorkspaceConfiguration {
		return vscode.workspace.getConfiguration('mochaExplorer', this.workspaceFolder.uri);
	}

	getTestFilesGlob(config: vscode.WorkspaceConfiguration): string {
		return config.get<string>('files') || 'test/**/*.js';
	}

	async lookupFiles(config: vscode.WorkspaceConfiguration): Promise<string[]> {

		const testFilesGlob = this.getTestFilesGlob(config);
		if (this.log.enabled) this.log.debug(`Looking for test files ${testFilesGlob} in ${this.workspaceFolder.uri.fsPath}`);
		const relativePattern = new vscode.RelativePattern(this.workspaceFolder, testFilesGlob);

		const fileUris = await vscode.workspace.findFiles(relativePattern);

		const testFiles = fileUris.map(uri => uri.fsPath);
		if (this.log.enabled) this.log.debug(`Found test files ${JSON.stringify(testFiles)}`);
		return testFiles;
	}

	getEnv(config: vscode.WorkspaceConfiguration): NodeJS.ProcessEnv {

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

	getCwd(config: vscode.WorkspaceConfiguration): string {
		const dirname = this.workspaceFolder.uri.fsPath;
		const configCwd = config.get<string>('cwd');
		const cwd = configCwd ? path.resolve(dirname, configCwd) : dirname;
		if (this.log.enabled) this.log.debug(`Using working directory: ${cwd}`);
		return cwd;
	}

	async readMochaOptsFile(file: string): Promise<Partial<MochaOpts>> {

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

	findOptValue(needles: string[], haystack: string[]): string | undefined {

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

	findOptValues(needles: string[], haystack: string[]): string[] {

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

	async getMochaOpts(config: vscode.WorkspaceConfiguration): Promise<MochaOpts> {

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

	mergeOpts<T>(configKey: string, fileConfigValue: T | undefined, config: vscode.WorkspaceConfiguration): T {

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

	getMochaPath(config: vscode.WorkspaceConfiguration): string {
		let mochaPath = config.get<string | null>('mochaPath');
		if (mochaPath) {
			return path.resolve(this.workspaceFolder.uri.fsPath, mochaPath);
		} else {
			return require.resolve('mocha');
		}
	}

	async getNodePath(config: vscode.WorkspaceConfiguration): Promise<string | undefined> {
		let nodePath = config.get<string | null>('nodePath') || undefined;
		if (nodePath === 'default') {
			nodePath = await detectNodePath();
		}
		if (this.log.enabled) this.log.debug(`Using nodePath: ${nodePath}`);
		return nodePath;
	}

	getMonkeyPatch(config: vscode.WorkspaceConfiguration): boolean {
		let monkeyPatch = config.get<boolean>('monkeyPatch');
		return (monkeyPatch !== undefined) ? monkeyPatch : true;
	}

	getDebuggerPort(config: vscode.WorkspaceConfiguration): number {
		return config.get<number>('debuggerPort') || 9229;
	}

	getDebuggerConfig(config: vscode.WorkspaceConfiguration): string | undefined {
		return config.get<string>('debuggerConfig') || undefined;
	}

	getIpcPort(config: vscode.WorkspaceConfiguration): number | undefined {
		return config.get<number>('ipcPort') || undefined;
	}

	getAdapterScript(config: vscode.WorkspaceConfiguration): string | undefined {
		return config.get<string>('adapterScript') || undefined;
	}
}

import * as path from 'path';
import * as fs from 'fs';
import RegExEscape from 'escape-string-regexp';
import { patchMocha } from './patchMocha';
import { processTests, resetSuite } from './processTests';
import ReporterFactory from './reporter';
import { ICommandProcessor, IQueueWriter } from './commandQueue';
import { WorkerArgsAugmented } from '../interfaces';
import { extractInit } from '../util';


export class CommandProcessor implements ICommandProcessor {
	private mocha!: Mocha;
	private mochaPath!: string;
	private sourceMapSupportEnabled!: boolean;
	private hotReloadStatus: 'supported' | 'unsupported' | 'exit' = 'unsupported';
	private nextHotReload?: () => void;
	private enableHmr: boolean | undefined;
	private mochaLib?: typeof import('mocha');


	/**
	 * Initializes mocha
	 */
	async initialize(writer: IQueueWriter, _args: WorkerArgsAugmented): Promise<void> {
		const args = extractInit(_args);
		this.sourceMapSupportEnabled = args.mochaOpts.requires.includes('source-map-support/register');

		process.chdir(args.cwd);

		for (const envVar in args.env) {
			const val = args.env[envVar];
			if (val === null) {
				delete process.env[envVar];
			} else {
				process.env[envVar] = val;
			}
		}

		this.enableHmr = args.enableHmr;
		this.mochaPath = args.mochaPath ? args.mochaPath : path.dirname(require.resolve('mocha'));
		writer.sendInfo(`Using the mocha package at ${this.mochaPath}`);
		const Mocha: typeof import('mocha') = require(this.mochaPath);
		this.mochaLib = Mocha;

		if ((_args.action === 'loadTests') && _args.monkeyPatch) {
			writer.sendInfo('Patching Mocha');
			patchMocha(
				Mocha,
				args.mochaOpts.ui,
				this.sourceMapSupportEnabled ? args.cwd : undefined,
				args.skipFrames,
				_args.logEnabled
					? msg => writer.sendInfo(msg)
					: undefined
			);
		}

		const cwd = process.cwd();
		module.paths.push(cwd, path.join(cwd, 'node_modules'));
		for (let req of args.mochaOpts.requires) {

			if (fs.existsSync(req) || fs.existsSync(`${req}.js`)) {
				req = path.resolve(req);
			}

			writer.sendInfo(`Trying require('${req}')`);
			require(req);
		}

		this.mocha = new Mocha();

		this.mocha.ui(args.mochaOpts.ui);
		this.mocha.timeout(args.mochaOpts.timeout);
		this.mocha.suite.retries(args.mochaOpts.retries);
	}

	dispose() {
		this.hotReloadStatus = 'exit';
		if (this.nextHotReload) {
			this.nextHotReload();
		}
	}

	/**
	 * Loads test list
	 */
	loadTests(writer: IQueueWriter, testFiles: string[]): void {
		writer.sendInfo('Loading files');
		for (const file of testFiles) {
			if (!this.mocha.files.includes(file)) {
				this.mocha.addFile(file);
			}
		}

		// add a hook that must be called
		if (this.enableHmr) {
			(global as any)['mocha-hot-reload'] = () => {
				if (this.nextHotReload) {
					this.nextHotReload();
				} else if (this.hotReloadStatus === 'unsupported') {
					this.hotReloadStatus = 'supported';
				}
			}
		}

		this.mocha.grep('$^');
		this.mocha.run(async () => {
			// send all tests
			const hotReload = this.hotReloadStatus === 'supported' ? 'initial' : undefined;
			await processTests(this.mocha.suite, writer, hotReload);

			if (this.enableHmr) {
				if (this.hotReloadStatus !== 'supported') {
					writer.sendError(`"mochaExplorer.enableHmr" has been set to true, HMR has not been hooked.`);
				} else {
					writer.preventStopping();
				}
				while (this.hotReloadStatus === 'supported') {
					// wait for change
					await new Promise(done => this.nextHotReload = done);
					if (this.hotReloadStatus !== 'supported') {
						break;
					}

					// sends test updates
					await processTests(this.mocha.suite, writer, 'update');
				}
			}

			// we're done here.
			writer.stop();
		});
	}

	/**
	 * Runs a collection of tests
	 */
	runTests(writer: IQueueWriter, testFiles: string[], tests: string[]): void {
		writer.sendInfo('Loading files');
		for (const file of testFiles) {
			if (!this.mocha.files.includes(file)) {
				this.mocha.addFile(file);
			}
		}

		// clone suite (necesary for HMR re-run)
		if (this.enableHmr) {
			resetSuite(this.mocha.suite);
		}


		// grep & set reporter
		const stringify: (obj: any) => string = require(`${this.mochaPath}/lib/utils`).stringify;
		const regExp = new RegExp(tests!.map(RegExEscape).join('|'));
		this.mocha.grep(regExp);
		this.mocha.reporter(<any>ReporterFactory(m => writer.sendMessage(m), stringify, this.sourceMapSupportEnabled));



		writer.sendInfo('Running tests');
		this.mocha.run(async () => {
			await writer.sendMessage({ type: 'finished' });
			writer.stop();
		});
	}
}

import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import { createConnection, receiveConnection, writeMessage } from 'vscode-test-adapter-remoting-util/out/ipc';
import split from 'split';
import RegExEscape from 'escape-string-regexp';
import { WorkerArgs, ErrorInfo, NetworkOptions } from 'vscode-test-adapter-remoting-util/out/mocha';
import { patchMocha } from './patchMocha';
import { processTests } from './processTests';
import ReporterFactory from './reporter';
import { CommandQueue, Pipe, ICommandProcessor } from './commandQueue';

(async () => {

	const netOptsJson = (process.argv.length > 2) ? process.argv[2] : '{}';
	const netOpts: NetworkOptions = JSON.parse(netOptsJson);

	let pipe: Pipe;
	if (netOpts.role && netOpts.port) {

		const socket = (netOpts.role === 'client') ?
			await createConnection(netOpts.port, { host: netOpts.host }) :
			await receiveConnection(netOpts.port, { host: netOpts.host });

		const splitted = socket.pipe(split());
		pipe = {
			write: msg => writeMessage(socket, msg),
			subscribe: receiver => splitted.once('data', x => receiver(JSON.parse(x))),
			unsubscribe: () => splitted.removeAllListeners(),
			dispose: () => socket.unref(),
		}
	} else if (process.send) {

		pipe = {
			write: msg => process.send!(msg),
			subscribe: receiver => process.on('message', receiver),
			unsubscribe: receiver => process.removeListener('message', receiver),
			dispose: () => { },
		}


	} else {

		pipe = {
			write: msg => console.log(msg),
			subscribe: receiver => receiver(JSON.parse(process.argv[3])),
			unsubscribe: () => { },
			dispose: () => { },
		}
	}

	const queue = new CommandQueue(pipe);
	queue.start(new CommandProcessor(queue));
})();

class CommandProcessor implements ICommandProcessor {
	private mocha!: Mocha;
	private locationSymbol = Symbol('location');
	private mochaPath!: string;
	private sourceMapSupportEnabled!: boolean;
	private hotReloadStatus: 'supported' | 'unsupported' | 'exit' = 'unsupported';
	private nextHotReload?: () => void;

	constructor(private queue: CommandQueue) {
	}

	/**
	 * Initializes mocha
	 */
	async initialize(args: WorkerArgs): Promise<void> {
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

		this.mochaPath = args.mochaPath ? args.mochaPath : path.dirname(require.resolve('mocha'));
		this.queue.sendInfo(`Using the mocha package at ${this.mochaPath}`);
		const Mocha: typeof import('mocha') = require(this.mochaPath);

		if ((args.action === 'loadTests') && args.monkeyPatch) {
			this.queue.sendInfo('Patching Mocha');
			patchMocha(
				Mocha,
				args.mochaOpts.ui,
				this.locationSymbol,
				this.sourceMapSupportEnabled ? args.cwd : undefined,
				args.logEnabled
					? msg => this.queue.sendInfo(msg)
					: undefined
			);
		}

		const cwd = process.cwd();
		module.paths.push(cwd, path.join(cwd, 'node_modules'));
		for (let req of args.mochaOpts.requires) {

			if (fs.existsSync(req) || fs.existsSync(`${req}.js`)) {
				req = path.resolve(req);
			}

			this.queue.sendInfo(`Trying require('${req}')`);
			require(req);
		}

		this.mocha = new Mocha();

		mocha.ui(args.mochaOpts.ui);
		mocha.timeout(args.mochaOpts.timeout);
		mocha.suite.retries(args.mochaOpts.retries);
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
	loadTests(testFiles: string[]): void {
		this.queue.sendInfo('Loading files');
		for (const file of testFiles) {
			mocha.addFile(file);
		}


		(global as any)['mocha-hot-reload'] = function () {
			if (this.nextHotReload) {
				this.nextHotReload();
			} else if (this.hotReloadStatus === 'unsupported') {
				this.hotReloadStatus = 'supported';
			}
		}

		mocha.grep('$^');
		mocha.run(async () => {
			// send all tests
			const hotReload = this.hotReloadStatus === 'supported' ? 'initial' : undefined;
			await processTests(mocha.suite, this.locationSymbol, this.queue, hotReload);

			while (this.hotReloadStatus === 'supported') {
				// wait for change
				await new Promise(done => this.nextHotReload = done);
				if (this.hotReloadStatus !== 'supported') {
					break;
				}

				// sends test updates
				await processTests(mocha.suite, this.locationSymbol, this.queue, 'update');
			}

			// we're done here.
			this.queue.stop();
		});
	}

	/**
	 * Runs a collection of tests
	 */
	runTests(testFiles: string[], tests: string[]): void {
		this.queue.sendInfo('Loading files');
		for (const file of testFiles) {
			mocha.addFile(file);
		}

		const stringify: (obj: any) => string = require(`${this.mochaPath}/lib/utils`).stringify;
		const regExp = new RegExp(tests!.map(RegExEscape).join('|'));
		mocha.grep(regExp);
		mocha.reporter(<any>ReporterFactory(m => this.queue.sendMessage(m), stringify, this.sourceMapSupportEnabled));

		this.queue.sendInfo('Running tests');
		mocha.run(async () => {
			await this.queue.sendMessage({ type: 'finished' });
			this.queue.stop();
		});
	}
}

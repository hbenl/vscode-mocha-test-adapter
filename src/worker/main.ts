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

(async () => {

	const netOptsJson = (process.argv.length > 2) ? process.argv[2] : '{}';
	const netOpts: NetworkOptions = JSON.parse(netOptsJson);

	if (netOpts.role && netOpts.port) {

		const socket = (netOpts.role === 'client') ?
			await createConnection(netOpts.port, { host: netOpts.host }) :
			await receiveConnection(netOpts.port, { host: netOpts.host });

		const argsJson = await new Promise<string>(resolve => {
			socket.pipe(split()).once('data', resolve);
		});

		execute(JSON.parse(argsJson), msg => writeMessage(socket, msg), () => socket.unref());

	} else if (process.send) {

		const args = await new Promise<WorkerArgs>(resolve => {
			process.once('message', resolve);
		});

		execute(args, async msg => process.send!(msg));

	} else {

		execute(JSON.parse(process.argv[3]), async msg => console.log(msg));

	}
})();

function execute(args: WorkerArgs, sendMessage: (message: any) => Promise<void>, onFinished?: () => void): void {

	let logEnabled = args.logEnabled;
	let sendErrorInfo = (args.action === 'loadTests');

	try {

		process.chdir(args.cwd);

		for (const envVar in args.env) {
			const val = args.env[envVar];
			if (val === null) {
				delete process.env[envVar];
			} else {
				process.env[envVar] = val;
			}
		}

		const mochaPath = args.mochaPath ? args.mochaPath : path.dirname(require.resolve('mocha'));
		if (args.logEnabled) sendMessage(`Using the mocha package at ${mochaPath}`);
		const Mocha: typeof import('mocha') = require(mochaPath);

		const locationSymbol = Symbol('location');
		if ((args.action === 'loadTests') && args.monkeyPatch) {
			if (args.logEnabled) sendMessage('Patching Mocha');
			patchMocha(Mocha, args.mochaOpts.ui, locationSymbol, args.cwd, args.logEnabled ? sendMessage : undefined);
		}

		const cwd = process.cwd();
		module.paths.push(cwd, path.join(cwd, 'node_modules'));
		for (let req of args.mochaOpts.requires) {

			if (fs.existsSync(req) || fs.existsSync(`${req}.js`)) {
				req = path.resolve(req);
			}

			if (args.logEnabled) sendMessage(`Trying require('${req}')`);
			require(req);
		}

		const mocha = new Mocha();

		mocha.ui(args.mochaOpts.ui);
		mocha.timeout(args.mochaOpts.timeout);
		mocha.suite.retries(args.mochaOpts.retries);

		if (logEnabled) sendMessage('Loading files');
		for (const file of args.testFiles) {
			mocha.addFile(file);
		}

		if (args.action === 'loadTests') {

			mocha.grep('$^');
			mocha.run(async () => {
				await processTests(mocha.suite, locationSymbol, sendMessage, args.logEnabled);
				if (onFinished) onFinished();
			});

		} else {

			const stringify: (obj: any) => string = require(`${mochaPath}/lib/utils`).stringify;
			const regExp = new RegExp(args.tests!.map(RegExEscape).join('|'));
			mocha.grep(regExp);
			mocha.reporter(<any>ReporterFactory(sendMessage, stringify));
	
			if (args.logEnabled) sendMessage('Running tests');
			mocha.run(() => {
				sendMessage({ type: 'finished' });
				if (onFinished) onFinished();
			});

		}

	} catch (err) {
		if (logEnabled) sendMessage(`Caught error ${util.inspect(err)}`);
		if (sendErrorInfo) sendMessage(<ErrorInfo>{ type: 'error', errorMessage: util.inspect(err) });
		throw err;
	}
}

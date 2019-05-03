import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import { createConnection, receiveConnection, writeMessage } from 'vscode-test-adapter-remoting-util/out/ipc';
import split from 'split';
import RegExEscape from 'escape-string-regexp';
import { WorkerArgs, ErrorInfo, NetworkOptions } from '../util';
import { patchMocha } from './patchMocha';
import { processTests } from './processTests';
import ReporterFactory from './reporter';

(async () => {
	try {

		const netOptsJson = process.argv[2];
		const netOpts: NetworkOptions = JSON.parse(netOptsJson);

		if (netOpts.role && netOpts.port) {

			const socket = (netOpts.role === 'client') ?
				await createConnection(netOpts.port, { host: netOpts.host }) :
				await receiveConnection(netOpts.port, { host: netOpts.host });

			const argsJson = await new Promise<string>(resolve => {
				socket.pipe(split()).once('data', resolve);
			});
	
			execute(argsJson, msg => writeMessage(socket, msg), () => socket.unref());

		} else if (process.send) {

			const argsJson = await new Promise<string>(resolve => {
				process.once('message', resolve);
			});

			execute(argsJson, msg => process.send!(msg));

		} else {

			execute(process.argv[3], msg => console.log(msg));

		}
	} catch (err) {
		throw err;
	}
})();

function execute(argsJson: string, sendMessage: (message: any) => void, onFinished?: () => void): void {

	let logEnabled = true;
	let sendErrorInfo = true;
	try {

		const args: WorkerArgs = JSON.parse(argsJson);
		logEnabled = args.logEnabled;
		sendErrorInfo = (args.action === 'loadTests');

		const Mocha: typeof import('mocha') = require(args.mochaPath);

		const lineSymbol = Symbol('line number');
		if ((args.action === 'loadTests') && args.monkeyPatch) {
			if (args.logEnabled) sendMessage('Patching Mocha');
			patchMocha(Mocha, args.mochaOpts.ui, lineSymbol, args.logEnabled ? sendMessage : undefined);
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
			mocha.run(() => {
				processTests(mocha.suite, lineSymbol, sendMessage, args.logEnabled);
				if (onFinished) onFinished();
			});

		} else {

			const regExp = new RegExp(args.tests!.map(RegExEscape).join('|'));
			mocha.grep(regExp);
			mocha.reporter(<any>ReporterFactory(sendMessage));
	
			if (args.logEnabled) sendMessage('Running tests');
			mocha.run(() => {
				if (onFinished) onFinished();
				if (args.mochaOpts.exit) process.exit();
			});

		}

	} catch (err) {
		if (logEnabled) sendMessage(`Caught error ${util.inspect(err)}`);
		if (sendErrorInfo) sendMessage(<ErrorInfo>{ type: 'error', errorMessage: util.inspect(err) });
		throw err;
	}
}

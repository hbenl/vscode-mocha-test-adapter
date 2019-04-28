import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import RegExEscape from 'escape-string-regexp';
import { WorkerArgs, ErrorInfo } from '../util';
import { patchMocha } from './patchMocha';
import { processTests } from './processTests';
import ReporterFactory from './reporter';

if (process.send) {
	process.once('message', argsJson => execute(argsJson, msg => process.send!(msg)));
} else {
	execute(process.argv[2], console.log);
}

function execute(argsJson: string, sendMessage: (message: any) => void): void {

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
			mocha.run(() => processTests(mocha.suite, lineSymbol, sendMessage, args.logEnabled));

		} else {

			const regExp = new RegExp(args.tests!.map(RegExEscape).join('|'));
			mocha.grep(regExp);
			mocha.reporter(<any>ReporterFactory(sendMessage));
	
			if (args.logEnabled) sendMessage('Running tests');
			mocha.run(args.mochaOpts.exit ? () => process.exit() : undefined);

		}

	} catch (err) {
		if (logEnabled) sendMessage(`Caught error ${util.inspect(err)}`);
		if (sendErrorInfo) sendMessage(<ErrorInfo>{ type: 'error', errorMessage: util.inspect(err) });
		throw err;
	}
}

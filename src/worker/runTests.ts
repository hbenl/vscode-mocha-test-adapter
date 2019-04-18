import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import RegExEscape from 'escape-string-regexp';
import ReporterFactory from './reporter';
import { WorkerArgs } from '../util';

if (process.send) {
	process.once('message', workerArgs => runTests(workerArgs, msg => process.send!(msg)));
} else {
	runTests(process.argv[2], console.log);
}

function runTests(workerArgs: string, sendMessage: (message: any) => void) {
	let _logEnabled = true;
	try {

		const {
			testFiles,
			tests,
			mochaPath,
			mochaOpts,
			logEnabled
		} = <WorkerArgs>JSON.parse(workerArgs);
		_logEnabled = logEnabled;

		const Mocha: typeof import('mocha') = require(mochaPath);

		const regExp = new RegExp(tests!.map(RegExEscape).join('|'));

		const cwd = process.cwd();
		module.paths.push(cwd, path.join(cwd, 'node_modules'));
		for (let req of mochaOpts.requires) {

			if (fs.existsSync(req) || fs.existsSync(`${req}.js`)) {
				req = path.resolve(req);
			}

			if (logEnabled) sendMessage(`Trying require('${req}')`);
			require(req);
		}

		const mocha = new Mocha();

		mocha.ui(mochaOpts.ui);
		mocha.timeout(mochaOpts.timeout);
		mocha.suite.retries(mochaOpts.retries);

		for (const file of testFiles) {
			mocha.addFile(file);
		}

		mocha.grep(regExp);
		mocha.reporter(<any>ReporterFactory(sendMessage));

		if (logEnabled) sendMessage('Running tests');

		mocha.run(mochaOpts.exit ? () => process.exit() : undefined);

	} catch (err) {
		if (_logEnabled) sendMessage(`Caught error ${util.inspect(err)}`);
		throw err;
	}
}

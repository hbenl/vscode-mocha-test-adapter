import * as path from 'path';
import * as fs from 'fs';
import * as RegExEscape from 'escape-string-regexp';
import ReporterFactory from './reporter';
import { copyOwnProperties, WorkerArgs } from '../util';

export function runTests(workerArgs: WorkerArgs, sendMessage: (message: any) => void, onFinished?: () => void) {
	const { testFiles, tests, mochaPath, mochaOpts, logEnabled } = workerArgs;

	try {

		const Mocha: typeof import('mocha') = require(mochaPath);

		const regExp = tests!.map(RegExEscape).join('|');

		const cwd = process.cwd();
		module.paths.push(cwd, path.join(cwd, 'node_modules'));
		for (let req of mochaOpts.requires) {

			if (fs.existsSync(req) || fs.existsSync(`${req}.js`)) {
				req = path.resolve(req);
			}

			if (logEnabled) sendMessage(`Trying require('${req}')`);
			require(req);
		}

		const mocha = new Mocha() as any as PrivateMocha;

		mocha.ui(mochaOpts.ui);
		mocha.timeout(mochaOpts.timeout);
		mocha.suite.retries(mochaOpts.retries);

		for (const file of testFiles) {
			mocha.addFile(file);
		}

		mocha.grep(regExp);
		mocha.reporter(<any>ReporterFactory(sendMessage));

		if (logEnabled) sendMessage('Running tests');

		mocha.run(() => {
			if (onFinished) {
				onFinished();
			}
			if (mochaOpts.exit) {
				process.exit();
			}
		});

	} catch (err) {
		if (logEnabled) sendMessage(`Caught error ${JSON.stringify(copyOwnProperties(err))}`);
		throw err;
	}
}

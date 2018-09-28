import * as path from 'path';
import * as fs from 'fs';
import * as RegExEscape from 'escape-string-regexp';
import { MochaOpts } from '../opts';
import ReporterFactory from './reporter';
import { copyOwnProperties } from '../util';
import { createClient } from '../ipc/client';

const ipcPort = <number | null>JSON.parse(process.argv[6]);
if (ipcPort) {
	createClient(ipcPort).then(ipcClient => {
		const sendMessage = (message: any) => ipcClient.sendMessage(message);
		runTests(sendMessage, () => ipcClient.dispose());
	});
} else {
	const sendMessage = process.send ? (message: any) => process.send!(message) : console.log;
	runTests(sendMessage);
}

function runTests(sendMessage: (message: any) => void, onFinished?: () => void) {

	let logEnabled = false;
	try {

		const files = <string[]>JSON.parse(process.argv[2]);
		const testsToRun = <string[]>JSON.parse(process.argv[3]);
		const mochaPath = <string>JSON.parse(process.argv[4]);
		const mochaOpts = <MochaOpts>JSON.parse(process.argv[5]);
		const logEnabled = <boolean>JSON.parse(process.argv[7]);

		const Mocha: typeof import('mocha') = require(mochaPath);

		const regExp = testsToRun.map(RegExEscape).join('|');

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

		for (const file of files) {
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

import * as path from 'path';
import * as fs from 'fs';
import * as Mocha from 'mocha';
import * as RegExEscape from 'escape-string-regexp';
import { MochaOpts } from '../opts';
import ReporterFactory from './reporter';
import { copyOwnProperties } from '../util';

const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};

let logEnabled = false;
try {

	const files = <string[]>JSON.parse(process.argv[2]);
	const testsToRun = <string[]>JSON.parse(process.argv[3]);
	const mochaOpts = <MochaOpts>JSON.parse(process.argv[4]);
	const logEnabled = <boolean>JSON.parse(process.argv[5]);

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

	mocha.run(mochaOpts.exit ? () => process.exit() : undefined);

} catch (err) {
	if (logEnabled) sendMessage(`Caught error ${JSON.stringify(copyOwnProperties(err))}`);
	throw err;
}

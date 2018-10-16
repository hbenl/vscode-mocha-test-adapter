import * as path from 'path';
import * as RegExEscape from 'escape-string-regexp';
import ReporterFactory from './reporter';
import { copyOwnProperties, WorkerArgs } from '../util';
import * as nodeRequire from 'nodeRequire';
import * as resolve from 'resolve';
import { WorkerPlugin } from './plugin';

export function runTests(workerArgs: WorkerArgs & {plugin: WorkerPlugin}, sendMessage: (message: any) => void, onFinished?: () => void) {
	const { testFiles, tests, mochaPath, mochaOpts, logEnabled, plugin } = workerArgs;

	try {

		const Mocha: typeof import('mocha') = nodeRequire(mochaPath);

		const regExp = tests!.map(RegExEscape).join('|');

		const cwd = process.cwd();
		module.paths.push(cwd, path.join(cwd, 'node_modules'));
		for (let req of mochaOpts.requires) {

			req = resolve.sync(req, {
				basedir: cwd,
				// Always respect require hooks as soon as they are loaded (possibly installed by the preceding require call)
				extensions: Object.keys(nodeRequire.extensions)
			});

			if (logEnabled) sendMessage(`Trying require('${req}')`);
			nodeRequire(req);
		}

		const mocha = new Mocha() as any as PrivateMocha;

		mocha.ui(mochaOpts.ui);
		mocha.timeout(mochaOpts.timeout);
		mocha.suite.retries(mochaOpts.retries);

		for (const file of testFiles) {
			mocha.addFile(file);
		}

		mocha.grep(regExp);
		mocha.reporter(<any>ReporterFactory(plugin, sendMessage));

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

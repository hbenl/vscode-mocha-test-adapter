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
import { fileExists } from '../util';

export default (async () => {

	let netOpts: NetworkOptions | undefined;

	const role = process.env['MOCHA_WORKER_IPC_ROLE'];
	const port = parseInt(process.env['MOCHA_WORKER_IPC_PORT'] || '');
	const host = process.env['MOCHA_WORKER_IPC_HOST'];
	if (((role === 'client') || (role === 'server')) && port) {
		netOpts = { role, port, host };
	}

	if (!netOpts && (process.argv.length > 2) &&
		process.argv[2].startsWith('{') && process.argv[2].endsWith('}')) {
		netOpts = JSON.parse(process.argv[2]);
	}

	if (netOpts && netOpts.role && netOpts.port) {

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

		execute(args, async msg => { process.send!(msg); });

	} else {

		execute(JSON.parse(process.argv[3]), async msg => console.log(msg));

	}
})();

async function execute(args: WorkerArgs, sendMessage: (message: any) => Promise<void>, onFinished?: () => void): Promise<void> {

	let logEnabled = args.logEnabled;
	let sendErrorInfo = (args.action === 'loadTests');
	const sourceMapSupportEnabled = args.mochaOpts.requires.includes('source-map-support/register');

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

		let requireOrImport: ((file: string) => Promise<any>) | undefined;
		if (args.esmLoader) {
			const esmUtilsPath = path.join(mochaPath, 'lib/esm-utils.js');
			if (await fileExists(esmUtilsPath)) {
				const esmUtils = require(esmUtilsPath);
				requireOrImport = esmUtils.requireOrImport;
			}
		}

		const locationSymbol = Symbol('location');
		if ((args.action === 'loadTests') && args.monkeyPatch) {
			if (args.logEnabled) sendMessage('Patching Mocha');
			patchMocha(
				Mocha,
				args.mochaOpts.ui,
				locationSymbol,
				sourceMapSupportEnabled ? args.cwd : undefined,
				args.logEnabled ? sendMessage : undefined
			);
		}

		const cwd = process.cwd();
		module.paths.push(cwd, path.join(cwd, 'node_modules'));
		let dir = mochaPath;
		while (true) {
			module.paths.push(path.join(dir, 'node_modules'));
			const next = path.dirname(dir);
			if (next === dir) break;
			dir = next;
		}

		let requires = []
		for (let req of args.mochaOpts.requires) {

			if (fs.existsSync(req) || fs.existsSync(`${req}.js`)) {
				req = path.resolve(req);
			}

			if (requireOrImport) {
				if (args.logEnabled) sendMessage(`Trying requireOrImport('${req}')`);
				requires.push(await requireOrImport(req));
			} else {
				if (args.logEnabled) sendMessage(`Trying require('${req}')`);
				requires.push(require(req));
			}
		}

		const mocha = new Mocha();

		mocha.ui(args.mochaOpts.ui);
		mocha.timeout(args.mochaOpts.timeout);
		mocha.suite.retries(args.mochaOpts.retries);

		requires
			.filter(e=>e.mochaHooks)
			.map(e=>e.mochaHooks)
			.forEach(e=>mocha.rootHooks(e))

		if (args.mochaOpts.delay) mocha.delay();
		if (args.mochaOpts.fullTrace) mocha.fullTrace();

		if (logEnabled) sendMessage('Loading files');
		for (const file of args.testFiles) {
			mocha.addFile(file);
		}

		if (args.esmLoader && (mocha as any).loadFilesAsync) {
			sendMessage('Trying to use Mocha\'s experimental ESM module loader');
			await mocha.loadFilesAsync();
		}

		if (args.action === 'loadTests') {

			mocha.grep('$^');
			mocha.run(async () => {
				await processTests(mocha.suite, locationSymbol, sendMessage, args.logEnabled);
				if (onFinished) onFinished();
			});

		} else {

			const stringify: (obj: any) => string = require(`${mochaPath}/lib/utils`).stringify;
			const regExp = new RegExp('^(' + args.tests!.map(RegExEscape).join('|') + ')$');
			mocha.grep(regExp);
			mocha.reporter(<any>ReporterFactory(sendMessage, stringify, sourceMapSupportEnabled));

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

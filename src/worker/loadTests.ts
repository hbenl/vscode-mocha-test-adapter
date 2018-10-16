import * as path from 'path';
import * as fs from 'fs';
import * as RegExpEscape from 'escape-string-regexp';
import { TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { patchMocha } from './patchMocha';
import { copyOwnProperties, ErrorInfo, WorkerArgs } from '../util';
import * as nodeRequire from 'nodeRequire';
import * as resolve from 'resolve';
import { WorkerPlugin } from './plugin';

export function loadTests(workerArgs: WorkerArgs & {plugin: WorkerPlugin}, sendMessage: (message: any) => void) {
	const { testFiles, mochaPath, mochaOpts, monkeyPatch, logEnabled, plugin } = workerArgs;

	try {

		const Mocha: typeof import('mocha') = nodeRequire(mochaPath);

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

		const lineSymbol = Symbol('line number');
		if (monkeyPatch) {
			if (logEnabled) sendMessage('Patching Mocha');
			patchMocha(Mocha, mochaOpts.ui, lineSymbol, logEnabled ? sendMessage : undefined);
		}

		const mocha = new Mocha() as any as PrivateMocha;
		mocha.ui(mochaOpts.ui);

		if (logEnabled) sendMessage('Loading files');
		for (const file of testFiles) {
			mocha.addFile(file);
		}
		mocha.loadFiles();

		if (logEnabled) sendMessage('Converting tests and suites');
		const fileCache = new Map<string, string>();
		const rootSuite = convertSuite(plugin, mocha.suite, lineSymbol, fileCache);

		if (rootSuite.children.length > 0) {
			sort(rootSuite);
			sendMessage(rootSuite);
		} else {
			sendMessage(null);
		}

	} catch (err) {
		if (logEnabled) sendMessage(`Caught error ${JSON.stringify(copyOwnProperties(err))}`);
		sendMessage(<ErrorInfo>{ type: 'error', errorMessage: err.stack });
		throw err;
	}
}


function convertSuite(
	plugin: WorkerPlugin,
	suite: Mocha.ISuite,
	lineSymbol: symbol,
	fileCache: Map<string, string>
): TestSuiteInfo {

	const childSuites: TestSuiteInfo[] = suite.suites.map((suite) => convertSuite(plugin, suite, lineSymbol, fileCache));
	const childTests: TestInfo[] = suite.tests.map((test) => convertTest(plugin, test, lineSymbol, fileCache));
	const children = (<(TestSuiteInfo | TestInfo)[]>childSuites).concat(childTests);
	let line = (<any>suite)[lineSymbol];
	if (line === undefined) {
		line = suite.file ? findLineContaining(suite.title, getFile(suite.file, fileCache)) : undefined;
	}

	return {
		type: 'suite',
		id: `${suite.file}: ${suite.fullTitle()}`,
		label: suite.title,
		file: plugin.convertAbsoluteRemotePathToLocal(suite.file!),
		line,
		children
	};
}

function convertTest(
	plugin: WorkerPlugin,
	test: Mocha.ITest,
	lineSymbol: symbol,
	fileCache: Map<string, string>
): TestInfo {

	let line = (<any>test)[lineSymbol];
	if (line === undefined) {
		line = test.file ? findLineContaining(test.title, getFile(test.file, fileCache)) : undefined;
	}

	return {
		type: 'test',
		id: `${test.file}: ${test.fullTitle()}`,
		label: test.title,
		file: plugin.convertAbsoluteRemotePathToLocal(test.file!),
		line,
		skipped: test.pending
	}
}

function getFile(file: string, fileCache: Map<string, string>): string {

	let content = fileCache.get(file);

	if (!content) {
		content = fs.readFileSync(file, 'utf8');
		fileCache.set(file, content);
	}

	return content;
}

function findLineContaining(needle: string, haystack: string | undefined): number | undefined {

	if (!haystack) return undefined;

	const index = haystack.search(RegExpEscape(needle));
	if (index < 0) return undefined;

	return haystack.substr(0, index).split('\n').length - 1;
}

function sort(suite: TestSuiteInfo): void {

	suite.children.sort((a, b) => {
		if ((a.line !== undefined) && (b.line !== undefined) && (a.line !== b.line)) {
			return a.line - b.line;
		} else {
			return a.label.localeCompare(b.label);
		}
	});

	for (const child of suite.children) {
		if (child.type === 'suite') {
			sort(child);
		}
	}
}

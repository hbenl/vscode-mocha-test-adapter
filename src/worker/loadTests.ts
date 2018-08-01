import * as path from 'path';
import * as fs from 'fs';
import * as Mocha from 'mocha';
import * as RegExpEscape from 'escape-string-regexp';
import { TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { MochaOpts } from '../opts';
import { patchMocha } from './patchMocha';
import { copyOwnProperties } from '../util';

const sendMessage = process.send ? (message: any) => process.send!(message) : console.log;

let logEnabled = false;
try {

	const files = <string[]>JSON.parse(process.argv[2]);
	const mochaOpts = <MochaOpts>JSON.parse(process.argv[3]);
	const monkeyPatch = <boolean>JSON.parse(process.argv[4]);
	logEnabled = <boolean>JSON.parse(process.argv[5]);

	const cwd = process.cwd();
	module.paths.push(cwd, path.join(cwd, 'node_modules'));
	for (let req of mochaOpts.requires) {

		if (fs.existsSync(req) || fs.existsSync(`${req}.js`)) {
			req = path.resolve(req);
		}

		if (logEnabled) sendMessage(`Trying require('${req}')`);
		require(req);
	}

	const lineSymbol = Symbol('line number');
	if (monkeyPatch) {
		if (logEnabled) sendMessage('Patching Mocha');
		patchMocha(mochaOpts.ui, lineSymbol, logEnabled ? sendMessage : undefined);
	}

	const mocha = new Mocha();
	mocha.ui(mochaOpts.ui);

	if (logEnabled) sendMessage('Loading files');
	for (const file of files) {
		mocha.addFile(file);
	}
	mocha.loadFiles();

	if (logEnabled) sendMessage('Converting tests and suites');
	const fileCache = new Map<string, string>();
	const rootSuite = convertSuite(mocha.suite, lineSymbol, fileCache);

	if (rootSuite.children.length > 0) {
		sort(rootSuite);
		rootSuite.label = 'Mocha';
		sendMessage(rootSuite);
	} else {
		sendMessage(null);
	}

} catch (err) {
	if (logEnabled) sendMessage(`Caught error ${JSON.stringify(copyOwnProperties(err))}`);
	throw err;
}


function convertSuite(
	suite: Mocha.ISuite,
	lineSymbol: symbol,
	fileCache: Map<string, string>
): TestSuiteInfo {

	const childSuites: TestSuiteInfo[] = suite.suites.map((suite) => convertSuite(suite, lineSymbol, fileCache));
	const childTests: TestInfo[] = suite.tests.map((test) => convertTest(test, lineSymbol, fileCache));
	const children = (<(TestSuiteInfo | TestInfo)[]>childSuites).concat(childTests);
	let line = (<any>suite)[lineSymbol];
	if (line === undefined) {
		line = suite.file ? findLineContaining(suite.title, getFile(suite.file, fileCache)) : undefined;
	}

	return {
		type: 'suite',
		id: suite.fullTitle(),
		label: suite.title,
		file: suite.file,
		line,
		children
	};
}

function convertTest(
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
		id: test.fullTitle(),
		label: test.title,
		file: test.file,
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

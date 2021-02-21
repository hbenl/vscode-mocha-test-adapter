import * as fs from 'fs';
import * as util from 'util';
import RegExpEscape from 'escape-string-regexp';
import { TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { ErrorInfo } from 'vscode-test-adapter-remoting-util/out/mocha';
import { Location } from './patchMocha';

export async function processTests(
	suite: Mocha.Suite,
	locationSymbol: symbol,
	sendMessage: (message: any) => Promise<void>,
	logEnabled: boolean
): Promise<void> {
	try {

		if (logEnabled) await sendMessage('Converting tests and suites');
		const fileCache = new Map<string, string>();
		const rootSuite = convertSuite(suite, locationSymbol, fileCache);

		if (rootSuite.children.length > 0) {
			await sendMessage(rootSuite);
		} else {
			await sendMessage(null);
		}

	} catch (err) {
		if (logEnabled) await sendMessage(`Caught error ${util.inspect(err)}`);
		await sendMessage(<ErrorInfo>{ type: 'error', errorMessage: util.inspect(err) });
		throw err;
	}
}


function convertSuite(
	suite: Mocha.Suite,
	locationSymbol: symbol,
	fileCache: Map<string, string>
): TestSuiteInfo {

	const childSuites: TestSuiteInfo[] = suite.suites.map((suite) => convertSuite(suite, locationSymbol, fileCache));
	const childTests: TestInfo[] = suite.tests.map((test) => convertTest(test, locationSymbol, fileCache));
	const children = (<(TestSuiteInfo | TestInfo)[]>childSuites).concat(childTests);

	let location: Location | undefined = (<any>suite)[locationSymbol];
	if ((location === undefined) && suite.file) {
		const line = findLineContaining(suite.title, getFile(suite.file, fileCache));
		if (line !== undefined) {
			location = { file: suite.file, line };
		}
	}

	return {
		type: 'suite',
		id: `${suite.file}: ${suite.fullTitle()}`,
		label: suite.title,
		file: location ? location.file : suite.file,
		line: location ? location.line : undefined,
		children
	};
}

function convertTest(
	test: Mocha.Test,
	locationSymbol: symbol,
	fileCache: Map<string, string>
): TestInfo {

	let location: Location | undefined = (<any>test)[locationSymbol];
	if ((location === undefined) && test.file) {
		const line = findLineContaining(test.title, getFile(test.file, fileCache));
		if (line !== undefined) {
			location = { file: test.file, line };
		}
	}

	return {
		type: 'test',
		id: `${test.file}: ${test.fullTitle()}`,
		label: test.title,
		file: location ? location.file : test.file,
		line: location ? location.line : undefined,
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

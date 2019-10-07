import * as fs from 'fs';
import * as util from 'util';
import RegExpEscape from 'escape-string-regexp';
import { TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { Location, locationSymbol, reRegisterSymbol } from './patchMocha';
import { IQueueWriter } from './commandQueue';

export async function processTests(
	suite: Mocha.ISuite,
	queue: IQueueWriter,
	hotReload?: 'initial' | 'update',
): Promise<void> {
	try {

		await queue.sendInfo('Converting tests and suites');
		const fileCache = new Map<string, string>();
		const rootSuite = convertSuite(suite, fileCache, hotReload);

		// set hot-reload flag on root suite
		if (hotReload) {
			rootSuite.hotReload = hotReload;
		}

		if (rootSuite.children.length > 0) {
			await queue.sendMessage(rootSuite);
		} else {
			await queue.sendMessage(null);
		}

	} catch (err) {
		await queue.sendInfo(`Caught error ${util.inspect(err)}`);
		await queue.sendError(err);
		throw err;
	}
}

export function resetSuite(suite: Mocha.ISuite) {
	const toReReg = [...suite.suites, ...suite.tests]
		.map(x => (x as any)[reRegisterSymbol])
		.filter(x => !!x);
	suite.suites.splice(0, suite.suites.length);
	suite.tests.splice(0, suite.tests.length);

	for (const r of toReReg) {
		r();
	}
}


function convertSuite(
	suite: Mocha.ISuite,
	fileCache: Map<string, string>,
	hotReload?: 'initial' | 'update',
): TestSuiteInfo {

	const children: (TestSuiteInfo | TestInfo)[] = [];
	const unique = new Map<string, TestSuiteInfo | TestInfo>();
	for (let i = suite.suites.length - 1; i >= 0; i--) {
		const s = suite.suites[i];
		const converted = convertSuite(s, fileCache);
		if (!hotReload) {
			children.unshift(converted);
			continue;
		}
		const newer = unique.get(converted.file!);
		if (newer) {
			if (hotReload === 'initial') {
				throw new Error('HMR does support multiple suites/tests per file: ' + converted.file!);
			}
			// there is a newer version => set flag & remove older
			newer.hotReload = 'update';
			suite.suites.splice(i, 1);
		} else {
			unique.set(converted.file!, converted);
			children.unshift(converted);
		}
	}
	for (let i = suite.tests.length - 1; i >= 0; i--) {
		const s = suite.tests[i];
		const converted = convertTest(s, fileCache);
		if (!hotReload) {
			children.unshift(converted);
			continue;
		}
		const newer = unique.get(converted.file!);
		if (newer) {
			if (hotReload === 'initial') {
				throw new Error('HMR does support multiple suites/tests per file: ' + converted.file!);
			}
			// there is a newer version => set flag & remove older
			newer.hotReload = 'update';
			suite.tests.splice(i, 1);
		} else {
			unique.set(converted.file!, s as any);
			children.unshift(converted);
		}
	}

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
	test: Mocha.ITest,
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

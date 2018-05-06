import * as Mocha from 'mocha';
import { TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { MochaOpts } from '../opts';

const sendMessage = process.send ? (message: any) => process.send!(message) : console.log;

const files = <string[]>JSON.parse(process.argv[2]);
const mochaOpts = <MochaOpts>JSON.parse(process.argv[3]);

const mocha = new Mocha();
mocha.ui(mochaOpts.ui);

for (const file of files) {
	mocha.addFile(file);
}
mocha.loadFiles();

const rootSuite = convertSuite(mocha.suite);

if (rootSuite.children.length > 0) {
	rootSuite.label = 'Mocha';
	sendMessage(rootSuite);
} else {
	sendMessage(undefined);
}


function convertSuite(suite: Mocha.ISuite): TestSuiteInfo {

	const childSuites: TestSuiteInfo[] = suite.suites.map((suite) => convertSuite(suite));
	const childTests: TestInfo[] = suite.tests.map((test) => convertTest(test));
	const children = (<(TestSuiteInfo | TestInfo)[]>childSuites).concat(childTests);

	return {
		type: 'suite',
		id: suite.title,
		label: suite.title,
		file: suite.file,
		children
	};
}

function convertTest(test: Mocha.ITest): TestInfo {
	return {
		type: 'test',
		id: test.title,
		label: test.title,
		file: test.file
	}
}

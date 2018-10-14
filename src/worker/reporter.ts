import * as path from 'path';
import { parse as parseStackTrace } from 'stack-trace';
import { stringify } from 'mocha/lib/utils';
import { createPatch } from 'diff';
import { TestEvent, TestSuiteEvent, TestDecoration } from 'vscode-test-adapter-api';

export default (sendMessage: (message: any) => void) => {

	return class Reporter {

		constructor(runner: Mocha.IRunner) {

			runner.on('suite', (suite: Mocha.ISuite) => {

				const event: TestSuiteEvent = {
					type: 'suite',
					suite: `${suite.file}: ${suite.fullTitle()}`,
					state: 'running'
				};

				sendMessage(event);
			});

			runner.on('suite end', (suite: Mocha.ISuite) => {

				const event: TestSuiteEvent = {
					type: 'suite',
					suite: `${suite.file}: ${suite.fullTitle()}`,
					state: 'completed'
				};

				sendMessage(event);
			});

			runner.on('test', (test: Mocha.ITest) => {

				const event: TestEvent = {
					type: 'test',
					test: `${test.file}: ${test.fullTitle()}`,
					state: 'running'
				};

				sendMessage(event);
			});

			runner.on('pass', (test: Mocha.ITest) => {

				const event: TestEvent = {
					type: 'test',
					test: `${test.file}: ${test.fullTitle()}`,
					state: 'passed'
				};

				sendMessage(event);
			});

			runner.on('fail', (test: Mocha.ITest, err: Error & { actual?: any, expected?: any, showDiff?: boolean }) => {

				let decorations: TestDecoration[] = [];
				if (err.stack) {
					const parsedStack = parseStackTrace(err);
					for (const stackFrame of parsedStack) {
						const filename = path.resolve(stackFrame.getFileName());
						if (filename === test.file) {
							decorations.push({
								line: stackFrame.getLineNumber() - 1,
								message: err.message
							});
							break;
						}
					}
				}

				let message = err.stack || err.message;

				if ((err.showDiff !== false) && 
					sameType(err.actual, err.expected) && 
					(err.expected !== undefined)) {

					const actualString = stringify(err.actual);
					const expectedString = stringify(err.expected);
					let diff = createPatch('string', actualString, expectedString, '', '');
					diff = diff
						.split('\n')
						.splice(5)
						.filter(line => !line.match(/\\ No newline/))
						.join('\n');

					message += '\n\n+ expected - actual\n\n' + diff;
				}

				const event: TestEvent = {
					type: 'test',
					test: `${test.file}: ${test.fullTitle()}`,
					state: 'failed',
					message,
					decorations
				};

				sendMessage(event);
			});

			runner.on('pending', (test: Mocha.ITest) => {

				const event: TestEvent = {
					type: 'test',
					test: `${test.file}: ${test.fullTitle()}`,
					state: 'skipped'
				};

				sendMessage(event);
			});
		}
	}
}

function sameType(a: any, b: any): boolean {
	return Object.prototype.toString.call(a) === Object.prototype.toString.call(b);
}

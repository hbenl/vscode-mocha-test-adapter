import * as path from 'path';
import stackTrace from 'stack-trace';
import { createPatch } from 'diff';
import { TestEvent, TestSuiteEvent, TestDecoration } from 'vscode-test-adapter-api';
import {buildTestId} from './worker-utils';

export default (sendMessage: (message: any) => void, stringify: (obj: any) => string, sloppyMatch: boolean) => {

	return class Reporter {

		constructor(runner: Mocha.IRunner) {

			const startTimes = new Map<string, number>();

			function getElapsedTime(id: string): string | undefined {

				if (startTimes.has(id)) {

					const elapsed = Date.now() - startTimes.get(id)!;
					startTimes.delete(id);
					return `${elapsed}ms`;

				} else {
					return undefined;
				}
			}

			runner.on('suite', (suite: Mocha.ISuite) => {

				const suiteId = buildTestId(suite);
				startTimes.set(suiteId, Date.now());

				const event: TestSuiteEvent = {
					type: 'suite',
					suite: suiteId,
					state: 'running'
				};

				sendMessage(event);
			});

			runner.on('suite end', (suite: Mocha.ISuite) => {

				const suiteId = buildTestId(suite);
				const description = getElapsedTime(suiteId);

				const event: TestSuiteEvent = {
					type: 'suite',
					suite: suiteId,
					state: 'completed',
					description
				};

				sendMessage(event);
			});

			runner.on('test', (test: Mocha.ITest) => {

				const testId = buildTestId(test);
				startTimes.set(testId, Date.now());

				const event: TestEvent = {
					type: 'test',
					test: testId,
					state: 'running'
				};

				sendMessage(event);
			});

			runner.on('pass', (test: Mocha.ITest) => {

				const testId = buildTestId(test);
				const description = getElapsedTime(testId);

				const event: TestEvent = {
					type: 'test',
					test: testId,
					state: 'passed',
					description
				};

				sendMessage(event);
			});

			runner.on('fail', (test: Mocha.ITest, err: Error & { actual?: any, expected?: any, showDiff?: boolean }) => {

				const testId = buildTestId(test);
				const description = getElapsedTime(testId);

				let decorations: TestDecoration[] = [];
				if (err.stack) {
					const parsedStack = stackTrace.parse(err);
					for (const stackFrame of parsedStack) {
						let filename = stackFrame.getFileName();
						if (typeof filename === 'string') {
							filename = path.resolve(filename);
							let matchFound = false;
							if (sloppyMatch && test.file) {
								const f1 = filename.substring(0, filename.length - path.extname(filename).length);
								const f2 = test.file.substring(0, test.file.length - path.extname(test.file).length);
								if (f1 === f2) {
									matchFound = true;
								}
							} else {
								if (filename === test.file) {
									matchFound = true;
								}
							}
							if (matchFound) {
								decorations.push({
									line: stackFrame.getLineNumber() - 1,
									message: err.message
								});
								break;
							}
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
					test: buildTestId(test),
					state: 'failed',
					message,
					decorations,
					description
				};

				sendMessage(event);
			});

			runner.on('pending', (test: Mocha.ITest) => {

				const testId = buildTestId(test);
				startTimes.delete(testId);

				const event: TestEvent = {
					type: 'test',
					test: testId,
					state: 'skipped',
					description: ''
				};

				sendMessage(event);
			});
		}
	}
}

function sameType(a: any, b: any): boolean {
	return Object.prototype.toString.call(a) === Object.prototype.toString.call(b);
}

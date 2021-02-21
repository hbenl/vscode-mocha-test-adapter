import * as path from 'path';
import * as os from 'os';
import stackTrace from 'stack-trace';
import { createPatch } from 'diff';
import { TestEvent, TestSuiteEvent, TestDecoration } from 'vscode-test-adapter-api';
import { retrieveSourceMap } from 'source-map-support';

export default (sendMessage: (message: any) => void, stringify: (obj: any) => string, useSourceMapSupport: boolean) => {

	return class Reporter {

		constructor(runner: Mocha.Runner) {

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

			runner.on('suite', suite => {

				const suiteId = `${suite.file}: ${suite.fullTitle()}`;
				startTimes.set(suiteId, Date.now());

				const event: TestSuiteEvent = {
					type: 'suite',
					suite: suiteId,
					state: 'running'
				};

				sendMessage(event);
			});

			runner.on('suite end', suite => {

				const suiteId = `${suite.file}: ${suite.fullTitle()}`;
				const description = getElapsedTime(suiteId);

				const event: TestSuiteEvent = {
					type: 'suite',
					suite: suiteId,
					state: 'completed',
					description
				};

				sendMessage(event);
			});

			runner.on('test', test => {

				const testId = `${test.file}: ${test.fullTitle()}`;
				startTimes.set(testId, Date.now());

				const event: TestEvent = {
					type: 'test',
					test: testId,
					state: 'running'
				};

				sendMessage(event);
			});

			runner.on('pass', test => {

				const testId = `${test.file}: ${test.fullTitle()}`;
				const description = getElapsedTime(testId);

				const event: TestEvent = {
					type: 'test',
					test: testId,
					state: 'passed',
					description
				};

				sendMessage(event);
			});

			runner.on('fail', (test, err: Error & { actual?: any, expected?: any, showDiff?: boolean }) => {

				const testId = `${test.file}: ${test.fullTitle()}`;
				const description = getElapsedTime(testId);

				let decorations: TestDecoration[] = [];
				if (err.stack) {
					const parsedStack = stackTrace.parse(err);
					for (const stackFrame of parsedStack) {
						let filename = stackFrame.getFileName();
						if (typeof filename === 'string') {
							if (filename.startsWith('file://')) {
								filename = filename.substring((os.platform() === 'win32') ? 8 : 7);
							}
							filename = path.resolve(filename);
							let matchFound = false;
							if (useSourceMapSupport && test.file) {
								const mapAndUrl = retrieveSourceMap(test.file);
								if (mapAndUrl && (typeof mapAndUrl.map === 'string')) {
									const parsedSourcemap = JSON.parse(mapAndUrl.map);
									if (parsedSourcemap.sources.length === 1) {
										const dirname = path.dirname(mapAndUrl.url);
										const sourceRoot = parsedSourcemap.sourceRoot || '';
										const originalSource = path.join(dirname, sourceRoot + parsedSourcemap.sources[0]);
										if (originalSource === filename) {
											matchFound = true;
										}
									}
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
					test: `${test.file}: ${test.fullTitle()}`,
					state: 'failed',
					message,
					decorations,
					description
				};

				sendMessage(event);
			});

			runner.on('pending', test => {

				const testId = `${test.file}: ${test.fullTitle()}`;
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

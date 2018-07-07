import * as path from 'path';
import { parse as parseStackTrace } from 'stack-trace';
import { TestEvent, TestSuiteEvent, TestDecoration } from 'vscode-test-adapter-api';

export default (sendMessage: (message: any) => void) => {

	return class Reporter {

		constructor(runner: Mocha.IRunner) {

			runner.on('suite', (suite: Mocha.ISuite) => {

				const event: TestSuiteEvent = {
					type: 'suite',
					suite: suite.fullTitle(),
					state: 'running'
				};

				sendMessage(event);
			});

			runner.on('suite end', (suite: Mocha.ISuite) => {

				const event: TestSuiteEvent = {
					type: 'suite',
					suite: suite.fullTitle(),
					state: 'completed'
				};

				sendMessage(event);
			});

			runner.on('test', (test: Mocha.ITest) => {

				const event: TestEvent = {
					type: 'test',
					test: test.fullTitle(),
					state: 'running'
				};

				sendMessage(event);
			});

			runner.on('pass', (test: Mocha.ITest) => {

				const event: TestEvent = {
					type: 'test',
					test: test.fullTitle(),
					state: 'passed'
				};

				sendMessage(event);
			});

			runner.on('fail', (test: Mocha.ITest, err: Error) => {

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

				const event: TestEvent = {
					type: 'test',
					test: test.fullTitle(),
					state: 'failed',
					message: err.stack || err.message,
					decorations
				};

				sendMessage(event);
			});

			runner.on('pending', (test: Mocha.ITest) => {

				const event: TestEvent = {
					type: 'test',
					test: test.fullTitle(),
					state: 'skipped'
				};

				sendMessage(event);
			});
		}
	}
}

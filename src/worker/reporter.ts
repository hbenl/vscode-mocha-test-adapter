import { TestEvent, TestSuiteEvent } from 'vscode-test-adapter-api';

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

				const event: TestEvent = {
					type: 'test',
					test: test.fullTitle(),
					state: 'failed',
					message: err.stack || err.message
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

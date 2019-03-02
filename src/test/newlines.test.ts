import * as assert from 'assert';
import { TestSuiteInfo } from 'vscode-test-adapter-api';
import { createTestMochaAdapter } from './adapter';

describe("Newlines in test titles", function () {

	// verify that tests whose titles contain '\n' are loaded and run properly
	it("should be handled properly", async function() {

		const adapter = createTestMochaAdapter('javascript', [ 'test/newlines.js' ]);

		// load tests
		await adapter.load();

		// verify the appropriate number of tests were found (3)
		const rootSuite = adapter.getLoadedTests();
		assert.strictEqual(rootSuite!.children.length, 1);
		assert.strictEqual(rootSuite!.children[0].type, 'suite');

		const suite = rootSuite!.children[0] as TestSuiteInfo;
		assert.strictEqual(suite.children.length, 3);

		// run a test with a newline in its title, verifying that only it was run.
		// previously there was a bug where everything after the newline was ignored,
		// causing multiple tests to be picked up when only one was specified.
		await adapter.run([suite.children[1].id]);

		const numTestsRun = adapter.getTestRunEvents()
			.filter(event => ((event.type === 'test') && (event.state === 'running'))).length;

		assert.strictEqual(numTestsRun, 1);
	});
});

import * as assert from 'assert';
import { createTestMochaAdapter } from "./adapter";
import { TestSuiteInfo } from 'vscode-test-adapter-api';

describe("Huge test suites with thousands of tests", function() {

	it("should be loaded and run", async function() {

		const adapter = await createTestMochaAdapter('javascript/huge');

		await adapter.load();

		const rootSuite = adapter.getLoadedTests();

		assert.equal((rootSuite!.children[0] as TestSuiteInfo).children.length, 10000);

		await adapter.run([ rootSuite!.id ]);

		assert.equal(adapter.getTestsThatWereRun().length, 10000);
	});
});

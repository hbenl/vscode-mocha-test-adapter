import * as assert from 'assert';
import { TestSuiteInfo } from 'vscode-test-adapter-api';
import { createTestMochaAdapter } from './adapter';
import { getExpectedTests } from './expectedTests';

describe("Loading tests without the monkey patch", function() {

	it("should find the locations of statically defined tests", async function() {

		const workspaceFolderName = 'javascript/bdd';
		const adapter = await createTestMochaAdapter(workspaceFolderName, { monkeyPatch: false });

		const expectedTests = getExpectedTests(workspaceFolderName);
		for (const dynamicTest of (expectedTests.children[0] as TestSuiteInfo).children) {
			delete dynamicTest.line;
		}

		await adapter.load();

		const rootSuite = adapter.getLoadedTests();

		assert.deepStrictEqual(rootSuite, expectedTests);
	});
});

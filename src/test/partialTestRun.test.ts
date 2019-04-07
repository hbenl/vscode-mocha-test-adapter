import * as assert from 'assert';
import { TestSuiteInfo } from 'vscode-test-adapter-api';
import { createTestMochaAdapter } from './adapter';

describe("Specifying tests to be run", function() {

	it("should work when specifying the suite", async function() {

		const adapter = await createTestMochaAdapter('javascript/bdd');

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();
		await adapter.run([ rootSuite!.children[1].id ]);

		assert.deepStrictEqual(adapter.getTestsThatWereRun(), [
			{ id: 'Suite #1 Test #1.1', result: 'passed' },
			{ id: 'Suite #1 Test #1.2', result: 'failed' },
			{ id: 'Suite #1 Test #1.3', result: 'skipped' }
		]);
	});

	it("should work when specifying the tests", async function() {

		const adapter = await createTestMochaAdapter('javascript/bdd');

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();
		const testIds = (rootSuite!.children[1] as TestSuiteInfo).children.map(info => info.id);
		await adapter.run(testIds);

		assert.deepStrictEqual(adapter.getTestsThatWereRun(), [
			{ id: 'Suite #1 Test #1.1', result: 'passed' },
			{ id: 'Suite #1 Test #1.2', result: 'failed' },
			{ id: 'Suite #1 Test #1.3', result: 'skipped' }
		]);
	});
});

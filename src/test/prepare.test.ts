import * as assert from 'assert';
import { createTestMochaAdapter } from "./adapter";

describe("Tests using mocha-prepare", function() {

	it("should be loaded", async function() {

		const workspaceFolderName = 'javascript/prepare';
		const adapter = await createTestMochaAdapter(workspaceFolderName);
	
		await adapter.load();

		const rootSuite = adapter.getLoadedTests();

		assert.strictEqual(rootSuite!.children.length, 2);
		assert.strictEqual(rootSuite!.children[0].label, 'Test #1');
		assert.strictEqual(rootSuite!.children[1].label, 'Test #2');

	});

	it("should be run", async function() {

		const workspaceFolderName = 'javascript/prepare';
		const adapter = await createTestMochaAdapter(workspaceFolderName);

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();
		await adapter.run([ rootSuite!.id ]);

		assert.deepStrictEqual(adapter.getTestsThatWereRun(), [
			{ id: 'Test #1', result: 'passed' },
			{ id: 'Test #2', result: 'failed' }
		]);
	});
});

import * as assert from 'assert';
import { createTestMochaAdapter } from "./adapter";

describe("The pruneFiles option", function() {

	it("should limit the set of loaded files to those needed for the current test run", async function() {

		const adapter = await createTestMochaAdapter('javascript/pruneFiles', { pruneFiles: true });

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();

		await adapter.run([ rootSuite!.children[0].id, rootSuite!.children[2].id ]);

		assert.deepStrictEqual(adapter.getMessages(), [
			'required.js was loaded\n',
			'setup.js was loaded\n',
			'test1.js was loaded\n',
			'test3.js was loaded\n',
		]);
	});
});

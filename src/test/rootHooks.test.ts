import * as assert from 'assert';
import { createTestMochaAdapter } from './adapter';

describe("Root hooks", function () {

	// verify that tests whose titles contain '\n' are loaded and run properly
	it("should be supported", async function() {

		const workspaceFolderName = 'javascript/rootHooks';
		const adapter = await createTestMochaAdapter(workspaceFolderName);

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();
		await adapter.run([ rootSuite!.id ]);

		assert.deepStrictEqual(adapter.getTestsThatWereRun(), [
			{ id: 'Test #1', result: 'passed' },
		]);
	});
});

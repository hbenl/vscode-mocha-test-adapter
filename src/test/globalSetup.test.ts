import * as assert from 'assert';
import { createTestMochaAdapter } from './adapter';

describe("Global fixtures", function () {

	it("should be supported", async function() {

		const workspaceFolderName = 'javascript/globalSetup';
		const adapter = await createTestMochaAdapter(workspaceFolderName);

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();
		await adapter.run([ rootSuite!.id ]);

		assert.deepStrictEqual(adapter.getTestsThatWereRun(), [
			{ id: 'Test #1', result: 'passed' },
		]);
	});
});

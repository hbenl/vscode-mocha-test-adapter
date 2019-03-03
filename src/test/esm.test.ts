import * as assert from 'assert';
import { createTestMochaAdapter } from "./adapter";
import { getExpectedTests, getExpectedTestRunEvents } from './expectedTests';

describe("ESM tests", function() {

	it("should be loaded", async function() {

		const workspaceFolderName = 'esm';
		const adapter = await createTestMochaAdapter(workspaceFolderName, { env: { 'NYC_ROOT_ID': '' } });
	
		await adapter.load();

		const rootSuite = adapter.getLoadedTests();

		assert.deepStrictEqual(rootSuite, getExpectedTests(workspaceFolderName));

	});

	it("should be run", async function() {

		const workspaceFolderName = 'esm';
		const adapter = await createTestMochaAdapter(workspaceFolderName, { env: { 'NYC_ROOT_ID': '' } });

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();
		await adapter.run([ rootSuite!.id ]);

		assert.deepStrictEqual(adapter.getTestRunEvents(), getExpectedTestRunEvents(workspaceFolderName));
	});
});

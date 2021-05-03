import * as assert from 'assert';
import { createTestMochaAdapter } from "./adapter";
import { getExpectedTests, getExpectedTestRunEvents, removeStackTraces } from './expectedTests';

describe("Babel tests", function() {

	it("should be loaded", async function() {

		const workspaceFolderName = 'babel';
		const adapter = await createTestMochaAdapter(workspaceFolderName);
	
		await adapter.load();

		const rootSuite = adapter.getLoadedTests();

		assert.deepStrictEqual(rootSuite, getExpectedTests(workspaceFolderName));

	});

	it("should be run", async function() {

		const workspaceFolderName = 'babel';
		const adapter = await createTestMochaAdapter(workspaceFolderName);

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();
		await adapter.run([ rootSuite!.id ]);

		const expectedTestRunEvents = getExpectedTestRunEvents(workspaceFolderName);
		assert.deepStrictEqual(
			removeStackTraces(adapter.getTestRunEvents()), 
			removeStackTraces(expectedTestRunEvents));
	});
});

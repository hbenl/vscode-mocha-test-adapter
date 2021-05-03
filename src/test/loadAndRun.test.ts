import * as assert from 'assert';
import { createTestMochaAdapter } from './adapter';
import { getExpectedTests, getExpectedTestRunEvents, removeStackTraces } from './expectedTests';

describe("Loading tests", function() {

	for (const ui of [ 'bdd', 'tdd' ]) {

		it(`should work with ${ui} tests`, async function() {

			const workspaceFolderName = `javascript/${ui}`;
			const adapter = await createTestMochaAdapter(workspaceFolderName);
	
			await adapter.load();
	
			const rootSuite = adapter.getLoadedTests();

			assert.deepStrictEqual(rootSuite, getExpectedTests(workspaceFolderName));
		});
	}
});

describe("Running tests", function() {

	for (const ui of [ 'bdd', 'tdd' ]) {

		it(`should work with ${ui} tests`, async function() {

			const workspaceFolderName = `javascript/${ui}`;
			const adapter = await createTestMochaAdapter(workspaceFolderName);
	
			await adapter.load();
			const rootSuite = adapter.getLoadedTests();
			await adapter.run([ rootSuite!.id ]);

			assert.deepStrictEqual(
				removeStackTraces(adapter.getTestRunEvents()), 
				removeStackTraces(getExpectedTestRunEvents(workspaceFolderName)));
		});
	}
});

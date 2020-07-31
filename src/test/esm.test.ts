import * as assert from 'assert';
import { createTestMochaAdapter } from "./adapter";
import { getExpectedTests, getExpectedTestRunEvents, removeStackTraces } from './expectedTests';

describe("ESM tests using the esm package from npm", function() {

	it("should be loaded", async function() {

		const workspaceFolderName = 'esm-npm';
		const adapter = await createTestMochaAdapter(workspaceFolderName, { env: { 'NYC_ROOT_ID': '' } });
	
		await adapter.load();

		const rootSuite = adapter.getLoadedTests();

		assert.deepStrictEqual(rootSuite, getExpectedTests(workspaceFolderName));

	});

	it("should be run", async function() {

		const workspaceFolderName = 'esm-npm';
		const adapter = await createTestMochaAdapter(workspaceFolderName, { env: { 'NYC_ROOT_ID': '' } });

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();
		await adapter.run([ rootSuite!.id ]);

		assert.deepStrictEqual(adapter.getTestRunEvents(), getExpectedTestRunEvents(workspaceFolderName));
	});
});

describe("ESM tests using Mocha's ESM loader", function() {

	it("should be loaded", async function() {

		const workspaceFolderName = 'esm-mocha';
		const adapter = await createTestMochaAdapter(workspaceFolderName);

		await adapter.load();

		const rootSuite = adapter.getLoadedTests();

		assert.deepStrictEqual(rootSuite, getExpectedTests(workspaceFolderName));

	});

	it("should be run", async function() {

		const workspaceFolderName = 'esm-mocha';
		const adapter = await createTestMochaAdapter(workspaceFolderName);

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();
		await adapter.run([ rootSuite!.id ]);

		assert.deepStrictEqual(
			removeStackTraces(adapter.getTestRunEvents()),
			removeStackTraces(getExpectedTestRunEvents(workspaceFolderName))
		);
	});
});

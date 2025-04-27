import * as assert from 'assert';
import { createTestMochaAdapter } from "./adapter";
import { getExpectedTests, getExpectedTestRunEvents, removeStackTraces } from './expectedTests';
import semver from 'semver';

// Check Node.js version
const nodeVersion = semver.coerce(process.version);
if (!nodeVersion) {
	throw new Error(`Unable to parse Node.js version: ${process.version}`);
}

/**
 * Node.js 20 and later have native ESM support, which
 * causes issues with the esm package. Issues are only
 * observed with Node.js 22 and above. The tests are
 * skipped in this case.
 */
const describeFn = semver.gte(nodeVersion, "22.0.0") ? describe.skip : describe;

describeFn("ESM tests using the esm package from npm", function() {

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

		assert.deepStrictEqual(
			removeStackTraces(adapter.getTestRunEvents()), 
			removeStackTraces(getExpectedTestRunEvents(workspaceFolderName)));
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

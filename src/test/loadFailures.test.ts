import * as assert from 'assert';
import { createTestMochaAdapter } from "./adapter";

describe("Loading a project without tests", function() {

	it("should return no root suite if there are no test files", async function() {

		const adapter = await createTestMochaAdapter('javascript/empty');

		await adapter.load();

		const testLoadFinishedEvent = adapter.getTestLoadFinishedEvent();
		assert.strictEqual(testLoadFinishedEvent!.suite, undefined);
		assert.strictEqual(testLoadFinishedEvent!.errorMessage, undefined);
	});

	it("should return an error message if the test files are broken", async function() {

		const adapter = await createTestMochaAdapter('javascript/broken');

		await adapter.load();

		const testLoadFinishedEvent = adapter.getTestLoadFinishedEvent();
		assert.strictEqual(testLoadFinishedEvent!.suite, undefined);
		assert.notEqual(testLoadFinishedEvent!.errorMessage, undefined);
	});
});

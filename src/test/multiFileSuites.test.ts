import * as path from 'path';
import * as assert from 'assert';
import { normalizePath } from '../util';
import { createTestMochaAdapter } from "./adapter";
import { removeStackTraces } from './expectedTests';

const workspaceFolderName = 'javascript/multiFileSuites';
const workspaceFolderPath = normalizePath(path.resolve(__dirname, './workspaces/' + workspaceFolderName));
const parentTestFilePath = path.join(workspaceFolderPath, 'test/parent.js');
const childTestFilePath = path.join(workspaceFolderPath, 'test/child.js');

describe("Multi-file suites", function() {

	it("should be loaded", async function() {

		const adapter = await createTestMochaAdapter(workspaceFolderName, { multiFileSuites: true });

		await adapter.load();

		const rootSuite = adapter.getLoadedTests();
		assert.deepStrictEqual(rootSuite, {
			"type": "suite",
			"id": `${workspaceFolderPath}: Mocha`,
			"label": "Mocha",
			"children": [
				{
					"type": "suite",
					"id": `${parentTestFilePath}: Suite`,
					"label": "Suite",
					"file": parentTestFilePath,
					"line": 0,
					"children": [
						{
							"type": "test",
							"id": `${parentTestFilePath}: Suite Test in same file`,
							"label": "Test in same file",
							"file": parentTestFilePath,
							"line": 1,
							"skipped": false
						}, {
							"type": "test",
							"id": `${parentTestFilePath}: Suite Test in different file`,
							"label": "Test in different file",
							"file": childTestFilePath,
							"line": 0,
							"skipped": false
						}
					]
				}
			]
		});
	});

	it("should be run", async function() {

		const adapter = await createTestMochaAdapter(workspaceFolderName, { multiFileSuites: true });

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();
		await adapter.run([ rootSuite!.id ]);

		assert.deepStrictEqual(
			removeStackTraces(adapter.getTestRunEvents()), 
			[
				{
					"type": "started",
					"tests": [
						`${workspaceFolderPath}: Mocha`
					],
					"testRunId": "0"
				},
				{
					"type": "suite",
					"suite": "undefined: ",
					"state": "running",
					"testRunId": "0"
				},
				{
					"type": "suite",
					"suite": `${parentTestFilePath}: Suite`,
					"state": "running",
					"testRunId": "0"
				},
				{
					"type": "test",
					"test": `${parentTestFilePath}: Suite Test in same file`,
					"state": "running",
					"testRunId": "0"
				},
				{
					"type": "test",
					"test": `${parentTestFilePath}: Suite Test in same file`,
					"state": "failed",
					"message": "Error: Failed",
					"decorations": [
						{
							"line": 2,
							"message": "Failed"
						}
					],
					"testRunId": "0"
				},
				{
					"type": "test",
					"test": `${parentTestFilePath}: Suite Test in different file`,
					"state": "running",
					"testRunId": "0"
				},
				{
					"type": "test",
					"test": `${parentTestFilePath}: Suite Test in different file`,
					"state": "failed",
					"message": "Error: Failed",
					"decorations":[
						{
							"line": 1,
							"message": "Failed"
						}
					],
					"testRunId": "0"
				},
				{
					"type": "suite",
					"suite": `${parentTestFilePath}: Suite`,
					"state": "completed",
					"testRunId": "0"
				},
				{
					"type": "suite",
					"suite": "undefined: ",
					"state": "completed",
					"testRunId": "0"
				},
				{
					"type": "finished",
					"testRunId": "0"
				}
			]);
	});
});

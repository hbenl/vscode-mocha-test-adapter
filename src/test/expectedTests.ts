import * as path from 'path';
import { TestSuiteInfo, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from "vscode-test-adapter-api";

export function getExpectedTests(workspaceName: string): TestSuiteInfo {

	const extension = (['typescript', 'sourcemap'].includes(workspaceName)) ? 'ts' : 'js'
	const extensionInID = (['typescript'].includes(workspaceName)) ? 'ts' : 'js'
	const workspaceFolderPath = path.resolve(__dirname, './workspaces/' + workspaceName);
	const staticTestFilePath = path.join(workspaceFolderPath, 'test/static.' + extension);
	const dynamicTestFilePath = path.join(workspaceFolderPath, 'test/dynamic.' + extension);
	const staticTestFilePathInID = path.join(workspaceFolderPath, 'test/static.' + extensionInID);
	const dynamicTestFilePathInID = path.join(workspaceFolderPath, 'test/dynamic.' + extensionInID);

	return {
		"type": "suite",
		"id": workspaceFolderPath + ": Mocha",
		"label": "Mocha",
		"children": [
			{
				"type": "suite",
				"id": dynamicTestFilePathInID + ": Suite #3",
				"label": "Suite #3",
				"file": dynamicTestFilePath,
				"line": 0,
				"children": [
					{
						"type": "test",
						"id": dynamicTestFilePathInID + ": Suite #3 Test #3.1",
						"label": "Test #3.1",
						"file": dynamicTestFilePath,
						"line": 1,
						"skipped": false
					},
					{
						"type": "test",
						"id": dynamicTestFilePathInID + ": Suite #3 Test #3.2",
						"label": "Test #3.2",
						"file": dynamicTestFilePath,
						"line": 3,
						"skipped": false
					},
					{
						"type": "test",
						"id": dynamicTestFilePathInID + ": Suite #3 Test #3.3",
						"label": "Test #3.3",
						"file": dynamicTestFilePath,
						"line": 3,
						"skipped": false
					}
				]
			},
			{
				"type": "suite",
				"id": staticTestFilePathInID + ": Suite #1",
				"label": "Suite #1",
				"file": staticTestFilePath,
				"line": 2,
				"children": [
					{
						"type": "test",
						"id": staticTestFilePathInID + ": Suite #1 Test #1.1",
						"label": "Test #1.1",
						"file": staticTestFilePath,
						"line": 4,
						"skipped": false
					},
					{
						"type": "test",
						"id": staticTestFilePathInID + ": Suite #1 Test #1.2",
						"label": "Test #1.2",
						"file": staticTestFilePath,
						"line": 8,
						"skipped": false
					},
					{
						"type": "test",
						"id": staticTestFilePathInID + ": Suite #1 Test #1.3",
						"label": "Test #1.3",
						"file": staticTestFilePath,
						"line": 12,
						"skipped": true
					}
				]
			},
			{
				"type": "suite",
				"id": staticTestFilePathInID + ": Suite #2",
				"label": "Suite #2",
				"file": staticTestFilePath,
				"line": 16,
				"children": [
					{
						"type": "test",
						"id": staticTestFilePathInID + ": Suite #2 Test #2.1",
						"label": "Test #2.1",
						"file": staticTestFilePath,
						"line": 17,
						"skipped": true
					}
				]
			}
		]
	}
}

export function getExpectedTestRunEvents(workspaceName: string): (TestRunStartedEvent | TestRunFinishedEvent | TestEvent | TestSuiteEvent)[] {

	const extension = (['typescript', 'sourcemap'].includes(workspaceName)) ? 'ts' : 'js';
	const extensionInID = (['typescript'].includes(workspaceName)) ? 'ts' : 'js';
	const workspaceFolderPath = path.resolve(__dirname, './workspaces/' + workspaceName);
	const staticTestFilePath = path.join(workspaceFolderPath, 'test/static.' + extensionInID);
	const dynamicTestFilePath = path.join(workspaceFolderPath, 'test/dynamic.' + extensionInID);

	return [
		{
			"type": "started",
			"tests": [
				workspaceFolderPath + ": Mocha"
			]
		},
		{
			"type": "suite",
			"suite": "undefined: ",
			"state": "running"
		},
		{
			"type": "suite",
			"suite": dynamicTestFilePath + ": Suite #3",
			"state": "running"
		},
		{
			"type": "test",
			"test": dynamicTestFilePath + ": Suite #3 Test #3.1",
			"state": "running"
		},
		{
			"type": "test",
			"test": dynamicTestFilePath + ": Suite #3 Test #3.1",
			"state": "skipped"
		},
		{
			"type": "test",
			"test": dynamicTestFilePath + ": Suite #3 Test #3.2",
			"state": "running"
		},
		{
			"type": "test",
			"test": dynamicTestFilePath + ": Suite #3 Test #3.2",
			"state": "passed"
		},
		{
			"type": "test",
			"test": dynamicTestFilePath + ": Suite #3 Test #3.3",
			"state": "running"
		},
		{
			"type": "test",
			"test": dynamicTestFilePath + ": Suite #3 Test #3.3",
			"state": "passed"
		},
		{
			"type": "suite",
			"suite": dynamicTestFilePath + ": Suite #3",
			"state": "completed"
		},
		{
			"type": "suite",
			"suite": staticTestFilePath + ": Suite #1",
			"state": "running"
		},
		{
			"type": "test",
			"test": staticTestFilePath + ": Suite #1 Test #1.1",
			"state": "running"
		},
		{
			"type": "test",
			"test": staticTestFilePath + ": Suite #1 Test #1.1",
			"state": "passed"
		},
		{
			"type": "test",
			"test": staticTestFilePath + ": Suite #1 Test #1.2",
			"state": "running"
		},
		{
			"type": "test",
			"test": staticTestFilePath + ": Suite #1 Test #1.2",
			"state": "failed",
			"decorations": [
				{
					"line": 9,
					"message": "1 == 2"
				}
			],
			"message": `AssertionError [ERR_ASSERTION]: 1 == 2\n    at Context.<anonymous> (test/static.${extension}:10:10)\n    at processImmediate (internal/timers.js:439:21)\n\n+ expected - actual\n\n-1\n+2\n`
		},
		{
			"type": "test",
			"test": staticTestFilePath + ": Suite #1 Test #1.3",
			"state": "skipped"
		},
		{
			"type": "suite",
			"suite": staticTestFilePath + ": Suite #1",
			"state": "completed"
		},
		{
			"type": "suite",
			"suite": staticTestFilePath + ": Suite #2",
			"state": "running"
		},
		{
			"type": "test",
			"test": staticTestFilePath + ": Suite #2 Test #2.1",
			"state": "skipped"
		},
		{
			"type": "suite",
			"suite": staticTestFilePath + ": Suite #2",
			"state": "completed"
		},
		{
			"type": "suite",
			"suite": "undefined: ",
			"state": "completed"
		},
		{
			"type": "finished"
		}
	];
}

import * as assert from 'assert';
import * as Path from 'path';
import * as vscode from 'vscode';
import { TestSuiteInfo } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';

import { MochaAdapter } from '../adapter';

const PROJECT_ROOT = Path.join(__dirname, '../../');
const WORKSPACES_ROOT = Path.join(PROJECT_ROOT, 'src/test/workspaces/');

suite("Extension Tests", function () {

    // verify that tests whose titles contain '\n' are loaded and run properly
    test("should handle test titles containing newlines properly", async function() {
        this.timeout(10000);

        // create Mocha adapter
        const adapter = createMochaAdapter('newlines');

        // load tests, storing discovered suite
        let suites: TestSuiteInfo[] = [];
        adapter.tests((e) => {
            if (e.type === 'finished' && e.suite) {
                suites.push(e.suite);
            }
        });

        await adapter.load();

        // verify the appropriate number of tests were found (3)
        assert.strictEqual(suites.length, 1);
        assert.strictEqual(suites[0].children.length, 1);
        assert.strictEqual(suites[0].children[0].type, 'suite');

        const suite = suites[0].children[0] as TestSuiteInfo;
        assert.strictEqual(suite.children.length, 3);

        // run a test with a newline in its title, verifying that only it was run.
        // previously there was a bug where everything after the newline was ignored,
        // causing multiple tests to be picked up when only one was specified.
        let numTestsRun = 0;
        adapter.testStates((e) => {
            if (e.type === 'test' && e.state === 'running') {
                numTestsRun++;
            }
        });

        await adapter.run([suite.children[1].id]);

        assert.strictEqual(numTestsRun, 1);
    });
});

function createMochaAdapter(testWorkspaceName: string) {
    const workspaceFolder: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file(Path.join(WORKSPACES_ROOT, testWorkspaceName)),
        name: testWorkspaceName,
        index: 0
    };
    const outputChannel = vscode.window.createOutputChannel('Mocha Tests');
    const log = new Log('mochaExplorer', workspaceFolder, 'Mocha Explorer Log');

    vscode.workspace.updateWorkspaceFolders(0, null, workspaceFolder);

    return new MochaAdapter(workspaceFolder, outputChannel, log);
}
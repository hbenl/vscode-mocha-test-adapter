# Mocha Test Explorer for Visual Studio Code

Run your Mocha tests using the 
[Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

![Screenshot](img/screenshot.png)

## Features
* Shows a Test Explorer in the Test view in VS Code's sidebar with all detected tests and suites and their state
* Adds CodeLenses to your test files for starting and debugging tests
* Adds Gutter decorations to your test files showing the tests' state
* Shows a failed test's log when the test is selected in the explorer
* Lets you choose test suites or individual tests in the explorer that should be run automatically after each file change

## Getting started
* Install the extension
* Restart VS Code and open the Test view
* Run / Debug your tests using the ![Run](img/run.png) / ![Debug](img/debug.png) icons in the Test Explorer or the CodeLenses in your test file

## Configuration

* `mochaExplorer.files`: The glob describing the location of your test files (relative to the workspace folder) (default: `test/**/*.js`)
* `mochaExplorer.env`: Environment variables to be set when running the tests
* `mochaExplorer.cwd`: The working directory where mocha is run (relative to the workspace folder)
* `mochaExplorer.ui`: The mocha ui used by the tests
* `mochaExplorer.timeout`: The test-case timeout in milliseconds
* `mochaExplorer.retries`: The number of times to retry failed tests
* `mochaExplorer.require`: Module(s) that Mocha should require()
* `mochaExplorer.exit`: shutdown the Mocha process (using process.exit()) after the last test has been run
* `mochaExplorer.node`: Absolute path to the node executable to use for loading and running your tests instead of the one shipped with VS Code
* `testExplorer.codeLens`: Show a CodeLens above each test or suite for running or debugging the tests
* `testExplorer.gutterDecoration`: Show the state of each test in the editor using Gutter Decorations
* `testExplorer.onStart`: Retire or reset all test states whenever a test run is started
* `testExplorer.onReload`: Retire or reset all test states whenever the test tree is reloaded
* `mochaExplorer.logpanel`: Write diagnotic logs to an output panel (note: in multi-root workspaces, this option is always taken from the first workspace folder)
* `mochaExplorer.logfile`: Write diagnostic logs to the given file (note: in multi-root workspaces, this option is always taken from the first workspace folder)

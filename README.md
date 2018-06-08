# Mocha Test Explorer for Visual Studio Code

This extension allows you to run your Mocha tests using the 
[Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

## Configuration

* `mochaExplorer.files`: The glob describing the location of your test files (relative to the workspace folder) (default: `test/**/*.js`)
* `mochaExplorer.env`: Environment variables to be set when running the tests
* `mochaExplorer.cwd`: The working directory where mocha is run (relative to the workspace folder)
* `mochaExplorer.ui`: The mocha ui used by the tests
* `mochaExplorer.timeout`: The test-case timeout in milliseconds
* `mochaExplorer.retries`: The number of times to retry failed tests
* `mochaExplorer.require`: Module(s) that Mocha should require()
* `mochaExplorer.exit`: shutdown the Mocha process (using process.exit()) after the last test has been run

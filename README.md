# Mocha Test Explorer for Visual Studio Code

Run your Mocha tests using the 
[Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

![Screenshot](img/screenshot.png)

## Features

* Shows a Test Explorer in the Test view in VS Code's sidebar with all detected tests and suites and their state
* Adds CodeLenses to your test files for starting and debugging tests
* Adds Gutter decorations to your test files showing the tests' state
* Adds line decorations to the source line where a test failed
* Shows a failed test's log when the test is selected in the explorer
* Lets you choose test suites or individual tests in the explorer that should be run automatically after each file change

## Getting started

* Install the extension and restart VS Code
* Put your Mocha command line options (if you have any) in a `mocha.opts` file or VS Code's settings (see below)
* Open the Test view
* Run / Debug your tests using the ![Run](img/run.png) / ![Debug](img/debug.png) icons in the Test Explorer or the CodeLenses in your test file

## Using transpilers (Typescript, Babel, etc.)

If you use a transpiler for your test sources, there are 2 ways to make the tests work in Mocha Test Explorer:
* running the original (non-transpiled) sources directly by transpiling them on-the-fly using `ts-node` for Typescript, `babel-register` for Babel, etc.
  Example for Typescript:
  ```json
  "mochaExplorer.files": "test/**/*.ts",
  "mochaExplorer.require": "ts-node/register"
  ```

* enabling source-maps in your transpiler's configuration and running the transpiled test sources using the
  [`source-map-support`](https://www.npmjs.com/package/source-map-support) package. Example for Typescript:
  ```json
  "mochaExplorer.files": "test/**/*.js",
  "mochaExplorer.require": "source-map-support/register"
  ```

## Running tests remotely

If you want/need to run your tests in a remote environment (e.g. in a docker container or on another machine via ssh),
you can do so by writing a "launcher script": this script will be called by Mocha Test Explorer (instead of its standard worker script)
to load and run the tests in the remote environment.
Documentation for writing launcher scripts can be found in the
[vscode-test-adapter-remoting-util](https://github.com/hbenl/vscode-test-adapter-remoting-util)
package, which also contains utility functions for writing your launcher script.
There are also example projects containing well-documented launcher scripts for running your tests
[in a docker container](https://github.com/hbenl/vscode-mocha-docker-example) or
[on another machine via ssh](https://github.com/hbenl/vscode-mocha-ssh-example).

Alternatively, you can use [VS Code Remote Development](https://code.visualstudio.com/docs/remote/remote-overview)
to move your workspace to the remote environment. If you do so, your tests will also be run in this environment automatically.
This is easier to set up (because you don't need to write a launcher script), but requires that your entire workspace and large
parts of VS Code run in the remote environment, which (depending on the environment) may be impractical or even impossible.

## Configuration

### Mocha command line options

You can put any command line options into [a `mocha.opts` file](https://mochajs.org/#mochaopts).
By default, this adapter will use `test/mocha.opts` but you can override that with the
`mochaExplorer.optsFile` setting.

Alternatively, you can put supported options into VS Code's settings:

Property                | Corresponding command line option
------------------------|----------------------------------
`mochaExplorer.ui`      | `-u`, `--ui` (default: `"bdd"`)
`mochaExplorer.timeout` | `-t`, `--timeout` (default: `2000`)
`mochaExplorer.retries` | `--retries` (default: `0`)
`mochaExplorer.require` | `-r`, `--require` (default: `[]`)
`mochaExplorer.exit`    | `--exit` (default: `false`)
`mochaExplorer.optsFile`| `--opts` (default: `"test/mocha.opts"`)

### Custom debugger configuration

If you want to customize the configuration used for debugging your tests (e.g. to set `sourceMapPathOverrides`
or `skipFiles`), you can do so by creating a debugging configuration in your `launch.json` and setting
`mochaExplorer.debuggerConfig` to the name of your debugging configuration.
Here's the default debugging configuration used by this adapter:
```
{
  "name": "Debug Mocha Tests",
  "type": "node",
  "request": "attach",
  "port": 9229,
  "protocol": "inspector",
  "timeout": 30000,
  "stopOnEntry": false
}
```

### Other options

Property                        | Description
--------------------------------|---------------------------------------------------------------
`mochaExplorer.files`           | The glob(s) describing the location of your test files (relative to the workspace folder) (default: `"test/**/*.js"`)
`mochaExplorer.env`             | Environment variables to be set when running the tests (e.g. `{ "NODE_ENV": "production" }`)
`mochaExplorer.envPath`         | Path to a dotenv file (relative to the workspace folder) containing environment variables to be set when running the tests
`mochaExplorer.cwd`             | The working directory where mocha is run (relative to the workspace folder)
`mochaExplorer.nodePath`        | The path to the node executable to use. By default it will attempt to find it on your PATH, if it can't find it or if this option is set to `null`, it will use the one shipped with VS Code
`mochaExplorer.mochaPath`       | The path to the mocha package to use (relative to the workspace folder). By default (or if this option is set to `null`) it uses a bundled version of mocha, to use the one installed in your project's `node_modules` folder, set this option to `"node_modules/mocha"`
`mochaExplorer.monkeyPatch`     | Apply a monkey patch to Mocha's `bdd`, `tdd` and `qunit` interfaces to get more accurate line numbers for the tests and suites (default: `true`)
`mochaExplorer.debuggerPort`    | The port to use for debugging sessions (default: `9229`)
`mochaExplorer.pruneFiles`      | Only load the test files needed for the current test run (default: `false` - load all configured files)
`mochaExplorer.launcherScript`  | The path to a launcher script (relative to the workspace folder) for [running your tests remotely](https://github.com/hbenl/vscode-test-adapter-remoting-util)
`testExplorer.codeLens`         | Show a CodeLens above each test or suite for running or debugging the tests
`testExplorer.gutterDecoration` | Show the state of each test in the editor using Gutter Decorations
`testExplorer.onStart`          | Retire or reset all test states whenever a test run is started
`testExplorer.onReload`         | Retire or reset all test states whenever the test tree is reloaded

## Commands

The following commands are available in VS Code's command palette, use the ID to add them to your keyboard shortcuts:

ID                                 | Command
-----------------------------------|--------------------------------------------
`mocha-explorer.enable`            | Enable Mocha Test Explorer for a workspace folder
`mocha-explorer.disable`           | Disable Mocha Test Explorer for a workspace folder
`test-explorer.reload`             | Reload tests
`test-explorer.run-all`            | Run all tests
`test-explorer.run-file`           | Run tests in current file
`test-explorer.run-test-at-cursor` | Run the test at the current cursor position
`test-explorer.cancel`             | Cancel running tests

## Troubleshooting
If the Test view doesn't show your tests or anything else doesn't work as expected, you can turn on diagnostic logging using one of the following configuration options
(note: in multi-root workspaces, these options are always taken from the first workspace folder):
* `mochaExplorer.logpanel`: Write diagnostic logs to an output panel
* `mochaExplorer.logfile`: Write diagnostic logs to the given file

There is a [bug in Node 10.6.0 - 10.9.0](https://github.com/nodejs/node/issues/21671) that breaks this adapter.
If you're using a version of Node affected by this bug, add `"mochaExplorer.nodePath": null` to your configuration as a workaround.

If you think you've found a bug, please [file a bug report](https://github.com/hbenl/vscode-mocha-test-adapter/issues) and attach the diagnostic logs.

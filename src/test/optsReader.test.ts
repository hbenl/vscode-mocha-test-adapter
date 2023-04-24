import * as path from 'path';
import * as assert from 'assert';
import { MochaOptsReader, MochaOptsAndFiles } from '../optsReader';
import { TestLog } from './adapter';

describe("The OptsReader", function() {

	it("should return defaults using mocha's parser if there is no config file", async function() {

		const optsReader = new MochaOptsReader(new TestLog());

		const optsAndFiles = await optsReader.readOptsUsingMocha(path.resolve(__dirname, 'workspaces/javascript/empty'));

		assert.deepStrictEqual(optsAndFiles, <MochaOptsAndFiles>{
			mochaOpts: {
				ui: 'bdd',
				requires: undefined,
				timeout: 2000,
				retries: undefined,
				delay: undefined,
				fullTrace: undefined,
				exit: undefined,
				asyncOnly: undefined
			},
			files: [],
			ignores: [],
			globs: []
		});
	});

	it("should return an empty result using the legacy parser if there is no config file", async function() {

		const optsReader = new MochaOptsReader(new TestLog());

		const optsAndFiles = await optsReader.readMochaOptsFile(path.resolve(__dirname, 'workspaces/javascript/empty/test/mocha.opts'));

		assert.deepStrictEqual(optsAndFiles, <MochaOptsAndFiles>{
			mochaOpts: {},
			files: [],
			ignores: [],
			globs: []
		});
	});

	it("should load all supported options using the legacy parser", async function() {

		const optsReader = new MochaOptsReader(new TestLog());

		const optsAndFiles = await optsReader.readMochaOptsFile(path.resolve(__dirname, 'workspaces/optsReader/test/mocha.opts'));

		assert.deepStrictEqual(optsAndFiles, <MochaOptsAndFiles>{
			mochaOpts: {
				ui: 'tdd',
				requires: [ 'ts-node/register', 'setup.js' ],
				timeout: 1000,
				retries: 2,
				delay: true,
				fullTrace: true,
				exit: true,
				asyncOnly: true
			},
			files: [ 'first.js' ],
			globs: [ 'test/*.ts', 'test*.js' ],
			ignores: [ 'test/*.no-test.js' ]
		});
	});

	it("should load inherited settings", async function() {
		const optsReader = new MochaOptsReader(new TestLog());

		const optsAndFiles = await optsReader.readOptsUsingMocha(path.resolve(__dirname, 'workspaces/extending'));

		assert.strictEqual(optsAndFiles.mochaOpts.ui, "tdd");

		assert.ok(optsAndFiles.mochaOpts.asyncOnly);
	})
});

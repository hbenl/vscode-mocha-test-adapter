import * as path from 'path';
import * as assert from 'assert';
import { MochaOptsReader, MochaOptsAndFiles } from '../optsReader';
import { TestLog } from './adapter';

describe("The OptsReader", function() {

	it("should load all supported options", async function() {

		const optsReader = new MochaOptsReader(new TestLog());

		const optsAndFiles = await optsReader.readMochaOptsFile(path.resolve(__dirname, 'workspaces/optsReader/mocha.opts'));

		assert.deepStrictEqual(optsAndFiles, <MochaOptsAndFiles>{
			mochaOpts: {
				ui: 'tdd',
				requires: [ 'ts-node/register', 'setup.js' ],
				timeout: 1000,
				retries: 2,
				exit: true
			},
			files: [ 'first.js' ],
			globs: [ 'test/*.ts', 'test*.js' ]
		});
	});
});

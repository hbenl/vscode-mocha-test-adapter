const pkg = require('./package.json');
const resolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');
export default {
	input: 'out/worker/main.js',
	// Rollup should not attempt to include these modules in the bundle
	external: ['path', 'fs', 'net', 'mocha'],
	output: [
		{
			file: 'out/worker/bundle.js',
			format: 'cjs',
			intro: `
				// Expose node's require() API to avoid rollup trying to bundle dynamic require() calls
				const nodeRequire = require;
			`,
		},
	],
	plugins: [
		resolve(),
		commonjs(),
	]
};

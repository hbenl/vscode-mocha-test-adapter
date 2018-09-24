const pkg = require('./package.json');
const resolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');
function entry(input, output) {
	return {
		input,
		// Rollup should not attempt to include these modules in the bundle
        external: ['path', 'fs'],
        output: [
            { file: output, format: 'cjs' },
        ],
		plugins: [
			resolve(),
			commonjs()
		]
	};
}
export default [
	entry('out/worker/loadTests.js', 'out/worker/loadTests-bundle.js'),
	entry('out/worker/runTests.js', 'out/worker/runTests-bundle.js')
];
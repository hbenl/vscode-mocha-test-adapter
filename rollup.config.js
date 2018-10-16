const pkg = require('./package.json');
const resolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');
function entry(input, output) {
	return {
		input,
		// Rollup should not attempt to include these modules in the bundle
        external: ['path', 'fs', 'net'],
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
	entry('out/worker/main.js', 'out/worker/bundle.js')
];

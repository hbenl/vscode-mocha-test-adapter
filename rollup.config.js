import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';

export default {

	input: 'src/worker/main.ts',

	output: {
		file: 'out/worker/bundle.js',
		format: 'cjs',
		sourcemap: true
	},

	external: [ 'fs', 'util', 'path', 'net', 'stream', 'buffer', 'string_decoder', 'mocha/lib/utils' ],

	plugins: [
		nodeResolve(),
		commonjs(),
		typescript({
			tsconfigOverride: { compilerOptions: { module: 'ES2015' } }
		}),
	]
}

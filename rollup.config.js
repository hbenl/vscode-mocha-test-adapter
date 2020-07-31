import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';

export default {

	input: 'src/worker/main.ts',

	output: {
		file: 'out/worker/bundle.js',
		format: 'cjs',
		sourcemap: true,
		exports: 'default'
	},

	external: [ 'os', 'fs', 'util', 'path', 'net', 'stream', 'buffer', 'string_decoder' ],

	plugins: [
		nodeResolve(),
		commonjs(),
		typescript({
			tsconfigOverride: { compilerOptions: { module: 'ES2015' } }
		}),
	]
}

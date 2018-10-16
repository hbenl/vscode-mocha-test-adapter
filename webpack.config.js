const Path = require('path');
const webpack = require('webpack');
// const ExtraWatchWebpackPlugin = require('extra-watch-webpack-plugin');
// const WebpackShellPlugin = require('webpack-shell-plugin');

/** @type {import('webpack').Configuration} */
const config = {
	target: 'node',
	node: false,
	entry: Path.join(__dirname, 'out/worker/main.js'),
	output: {
		path: Path.resolve(__dirname, 'out/worker'),
		filename: 'bundle.js',
		devtoolModuleFilenameTemplate: '[resource-path]'
	},
	mode: 'development',
	devtool: false, // use the plugin config (below)
	optimization: {
		minimize: false
	},
	externals: {
		nodeRequire: 'require'
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				use: ['source-map-loader'],
				enforce: "pre"
			}
		]
	},
	plugins: [
		new webpack.SourceMapDevToolPlugin({
			test: /\.(?:js|ts)$/,
			moduleFilenameTemplate:'[resource-path]',
			fallbackModuleFilenameTemplate:'[resource-path]?[hash]',
			filename: "[file].map",
			sourceRoot:'../..',
			noSources: true,
		}),
	// 	new WebpackShellPlugin({
	// 		onBuildStart: ['tsc'],
	// 		// onBuildEnd: ['python script.py && node script.js']
	// 	}),
	// 	new ExtraWatchWebpackPlugin({
	// 		files: [ __dirname + '/tsconfig.json', __dirname + '/src/**/*.ts' ],
	// 	})
	]
}

module.exports = config;

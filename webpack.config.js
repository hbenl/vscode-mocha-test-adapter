const path = require('path');

/** @type {import('webpack').Configuration} */
module.exports = {
	target: 'node',
	entry: path.resolve(__dirname, 'out/worker/main.js'),
	output: {
		path: path.resolve(__dirname, 'out/worker'),
		filename: 'bundle.js'
	},
	mode: 'development',
	externals: {
		'./nodeRequire': 'require'
	}
};

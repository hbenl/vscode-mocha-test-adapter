const prepare = require('mocha-prepare');
const testData = require('./shared').testData;

const beforeAll = function(done) {
	setTimeout(function() {
		testData.tests = [
			{ name: 'Test #1', succeed: true },
			{ name: 'Test #2', succeed: false }
		];
		done();
	},
	100);
}

prepare(beforeAll);

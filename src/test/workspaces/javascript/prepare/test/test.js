const assert = require('assert');
const tests = require('../shared').testData.tests;

for (let test of tests) {
	it(test.name, function() {
		assert.ok(test.succeed);
	});
}

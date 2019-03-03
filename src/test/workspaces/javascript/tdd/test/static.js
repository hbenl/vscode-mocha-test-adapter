const assert = require('assert');

suite("Suite #1", function() {

	test("Test #1.1", function() {
		assert.equal(1, 1);
	});

	test("Test #1.2", function() {
		assert.equal(1, 2);
	});

	test.skip("Test #1.3", function() {
	});
});

suite.skip("Suite #2", function() {
	test("Test #2.1", function() {
	});
});

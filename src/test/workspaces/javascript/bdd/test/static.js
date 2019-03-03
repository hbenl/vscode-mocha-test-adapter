const assert = require('assert');

describe("Suite #1", function() {

	it("Test #1.1", function() {
		assert.equal(1, 1);
	});

	it("Test #1.2", function() {
		assert.equal(1, 2);
	});

	it.skip("Test #1.3", function() {
	});
});

describe.skip("Suite #2", function() {
	it("Test #2.1", function() {
	});
});

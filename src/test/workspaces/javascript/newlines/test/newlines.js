var assert = require('assert');

describe('tests', function() {
	it('ABC\n123', function() {
		assert.notStrictEqual(1, 2);
	});

	it('ABC\n	456', function() {
		assert.notStrictEqual(1, 2);
	});

	it('ABC\n\t789', function() {
		assert.notStrictEqual(1, 2);
	});
});

suite("Suite #3", function() {
	test("Test " + "#3.1", function() { this.skip(); });
	for (const i of [2,3]) {
		test("Test #3." + i, function() {});
	}
});

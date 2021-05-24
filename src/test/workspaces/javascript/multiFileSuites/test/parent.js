describe("Suite", function() {
	it("Test in same file", function() {
		throw new Error("Failed");
	});
	require("./child.js");
});

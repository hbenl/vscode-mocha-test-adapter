const net = require("net");

it("should keep the node process alive", function() {
	setTimeout(() => { process.exit(); }, 5000);
});

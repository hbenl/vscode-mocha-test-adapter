const net = require("net");

it("should keep the node process alive", function() {
});

// this will occupy port 12345 - so we can check if a process that loaded this file is still running
const server = net.createServer();
server.listen(12345);

// we kill the process after 5 seconds - just to make working with this test easier 
setTimeout(() => { process.exit(); }, 5000);

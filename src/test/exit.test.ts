import * as net from "net";
import { createTestMochaAdapter } from "./adapter";

describe("Test files that keep the node process alive", function() {

	it("should not be left running after loading the tests", async function() {

		const adapter = await createTestMochaAdapter('javascript/exit-load');

		await adapter.load();
		await new Promise(resolve => setTimeout(resolve, 10));

		await throwIfWorkerProcessIsRunning();
	});

	it("should not be left running after running the tests", async function() {

		this.timeout(1000);

		const adapter = await createTestMochaAdapter('javascript/exit-run');

		await adapter.load();
		const rootSuite = adapter.getLoadedTests();
		await adapter.run([ rootSuite!.id ]);

		await throwIfWorkerProcessIsRunning();
	});
});

function throwIfWorkerProcessIsRunning(): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const server = net.createServer();
		// check if port 12345 is still occupied - it shouldn't be
		server.listen(12345, ((e: any) => {
			if (e) {
				reject(e);
			} else {
				server.close();
				resolve();
			}
		}) as (() => void));
	});
}

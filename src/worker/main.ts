import * as net from 'net';
import { WorkerArgs } from 'vscode-test-adapter-remoting-util/out/mocha';
import { createConnection, receiveConnection, writeMessage } from 'vscode-test-adapter-remoting-util';

const workerArgs = <WorkerArgs>JSON.parse(process.argv[2]);
const { action, ipcPort, ipcHost, ipcRole } = workerArgs;

if (ipcPort) {

	let socketPromise: Promise<net.Socket>;
	if (ipcRole === 'server') {
		socketPromise = receiveConnection(ipcPort, { host: ipcHost });
	} else {
		socketPromise = createConnection(ipcPort, { host: ipcHost });
	}

	socketPromise.then(socket => {
		doWorkerAction((msg: any) => writeMessage(socket, msg), () => socket.end());
	});

} else {

	const sendMessage = process.send ? (message: any) => process.send!(message) : console.log;
	doWorkerAction(sendMessage);

}

function doWorkerAction(sendMessage: (message: any) => void, onFinished?: () => void) {
	if (action === 'runTests') {
		require('./runTests').runTests(workerArgs, sendMessage, onFinished);
	} else {
		require('./loadTests').loadTests(workerArgs, sendMessage, onFinished);
	}
}

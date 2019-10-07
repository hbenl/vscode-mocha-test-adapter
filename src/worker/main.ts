import { createConnection, receiveConnection, writeMessage } from 'vscode-test-adapter-remoting-util/out/ipc';
import split from 'split';
import { NetworkOptions } from 'vscode-test-adapter-remoting-util/out/mocha';
import { CommandQueue, Pipe } from './commandQueue';
import { CommandProcessor } from './command-processor';

(async () => {

	const netOptsJson = (process.argv.length > 2) ? process.argv[2] : '{}';
	const netOpts: NetworkOptions = JSON.parse(netOptsJson);

	let pipe: Pipe;
	if (netOpts.role && netOpts.port) {

		const socket = (netOpts.role === 'client') ?
			await createConnection(netOpts.port, { host: netOpts.host }) :
			await receiveConnection(netOpts.port, { host: netOpts.host });

		const splitted = socket.pipe(split());
		pipe = {
			write: msg => writeMessage(socket, msg),
			subscribe: receiver => splitted.once('data', x => receiver(JSON.parse(x))),
			unsubscribe: () => splitted.removeAllListeners(),
			dispose: () => socket.unref(),
		}
	} else if (process.send) {

		pipe = {
			write: msg => process.send!(msg),
			subscribe: receiver => process.on('message', receiver),
			unsubscribe: receiver => process.removeListener('message', receiver),
			dispose: () => { },
		}


	} else {

		pipe = {
			write: msg => console.log(msg),
			subscribe: receiver => receiver(JSON.parse(process.argv[3])),
			unsubscribe: () => { },
			dispose: () => { },
		}
	}

	const queue = new CommandQueue(pipe);
	queue.start(new CommandProcessor());
})();

import * as net from 'net';
import * as vscode from 'vscode';
import * as split2 from 'split2';
import { Log } from 'vscode-test-adapter-util';

export async function createServer(port: number, handler: (msg: any) => void, log: Log): Promise<vscode.Disposable> {

	const server = await createServerAndListen(port, log);

	server.on('connection', (socket: net.Socket) => {

		log.info('IPC client connected to server');

		// only one connection should be accepted, so we're closing the server now
		// (this won't close the connection that was just established)
		server.close();

		socket.pipe(split2()).on('data', (data: string) => {
			handler(JSON.parse(data));
		});

		socket.on('end', () => {
			log.info('IPC client disconnected from server');
		});
	});

	return {
		dispose() {

			log.info('Disposing IPC server');

			if (server.listening) {
				log.info('Closing IPC server');
				server.close();
			}
		}
	};
}

function createServerAndListen(port: number, log: Log): Promise<net.Server> {
	return new Promise<net.Server>((resolve, reject) => {

		function onListening() {
			log.info(`IPC server is listening on port ${port}`);
			server.removeListener('error', onError);
			resolve(server);
		}

		function onError(err: Error) {
			server.removeListener('listening', onListening);
			reject(err);
		}

		const server = net.createServer();
		log.info('IPC server created');

		server.once('listening', onListening);
		server.once('error', onError);

		server.listen(port);
	});
}

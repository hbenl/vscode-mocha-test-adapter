import * as net from 'net';
import * as vscode from 'vscode';
import { Log } from 'vscode-test-adapter-util';
import { IpcEndpoint } from './common';
import { Deferred } from './common';

export type MinimalLog = Pick<Log, 'info'>;
interface Server extends vscode.Disposable {
	connection: Promise<IpcEndpoint>;
}

export async function createServer(port: number, handler: (msg: any) => void, log: MinimalLog): Promise<Server> {

	const server = await createServerAndListen(port, log);
	const connectionDeferred = Deferred<IpcEndpoint>();

	server.on('connection', (socket: net.Socket) => {

		log.info('IPC client connected to server');

		// only one connection should be accepted, so we're closing the server now
		// (this won't close the connection that was just established)
		server.close();

		const endpoint = new IpcEndpoint(socket);
		endpoint.on('message', handler);

		socket.on('end', () => {
			log.info('IPC client disconnected from server');
		});
		connectionDeferred.resolve(endpoint);
	});

	return {
		connection: connectionDeferred.promise,

		dispose() {

			log.info('Disposing IPC server');

			if (server.listening) {
				log.info('Closing IPC server');
				server.close();
			}
			connectionDeferred.reject('IPC server closed');
		}
	};
}

function createServerAndListen(port: number, log: MinimalLog): Promise<net.Server> {
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

import * as net from 'net';
import { IpcEndpoint as _IpcEndpoint, IpcEndpoint } from './common';
import { MinimalLog } from './server';

export async function createClient(port: number, handler: (msg: any) => void, log: MinimalLog): Promise<IpcEndpoint> {
	const socket = await createConnection(port, log);
	const client = new IpcEndpoint(socket);
	client.on('message', handler);
	return client;
}

function createConnection(port: number, log: MinimalLog): Promise<net.Socket> {
	return new Promise<net.Socket>((resolve, reject) => {

		function onConnect() {
			log.info('IPC client connected to server');
			socket.removeListener('error', onError);
			resolve(socket);
		}
	
		function onError(err: Error) {
			log.info('IPC client error trying to connect to server: ' + err);
			socket.removeListener('connect', onConnect);
			reject(err);
		}
	
		const socket = net.createConnection(port);

		socket.once('connect', onConnect);
		socket.once('error', onError);

		log.info('IPC client created; trying to connect to server');
	});
}

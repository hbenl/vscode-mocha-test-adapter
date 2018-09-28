import * as net from 'net';

export class Client {

	constructor(private readonly socket: net.Socket) {}

	sendMessage(msg: any): void {
		this.socket.write(JSON.stringify(msg) + '\n');
	}

	dispose(): void {
		this.socket.end();
	}
}

export async function createClient(port: number): Promise<Client> {
	const socket = await createConnection(port);
	return new Client(socket);
}

function createConnection(port: number): Promise<net.Socket> {
	return new Promise<net.Socket>((resolve, reject) => {

		function onConnect() {
			socket.removeListener('error', onError);
			resolve(socket);
		}
	
		function onError(err: Error) {
			socket.removeListener('connect', onConnect);
			reject(err);
		}
	
		const socket = net.createConnection(port);

		socket.once('connect', onConnect);
		socket.once('error', onError);
	});
}

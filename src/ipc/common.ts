import {EventEmitter} from 'ee-ts';
import * as net from 'net';
import * as split2 from 'split2';

export function Deferred<T>() {
	let resolve: (value?: T | PromiseLike<T>) => void;
	let reject: (reason?: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return {
		promise,
		resolve: resolve!,
		reject: reject!
	};
}

interface IpcEndpointEvents {
	message: (msg: any) => void;
}

export class IpcEndpoint extends EventEmitter<IpcEndpointEvents> {

	constructor(private readonly socket: net.Socket) {
		super();

		this.socket.pipe(split2()).on('data', (data: string) => {
			this.emit('message', JSON.parse(data));
		});
	}

	sendMessage(msg: any): void {
		this.socket.write(JSON.stringify(msg) + '\n');
	}

	dispose(): void {
		super.off('*');
		this.socket.end();
	}
}

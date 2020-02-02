import { WorkerArgs, ErrorInfo } from 'vscode-test-adapter-remoting-util/out/mocha';
import { deepEqual, areCompatibleRunners } from '../util';
import * as util from 'util';
import { WorkerArgsAugmented } from '../interfaces';

export interface Pipe {
	subscribe(messageProcessor: (messgage: any) => void): void;
	unsubscribe(messageProcessor: (messgage: any) => void): void;
	write(message: any): void | Promise<void>;
	dispose(): void;
}
export interface ICommandProcessor {
	loadTests(writer: IQueueWriter, testFiles: string[]): void;
	runTests(writer: IQueueWriter, testFiles: string[], tests: string[]): void;
	initialize(writer: IQueueWriter, args: WorkerArgs): Promise<void>;
	dispose(): void;
}
export interface IQueueWriter {
	preventStopping(): void;
	stop(): void;
	sendInfo(info: string): Promise<void>;
	sendError(err: any): Promise<void>;
	sendMessage(message: any): Promise<void>;
}

export class CommandQueue {
	private commandProcessor!: ICommandProcessor;
	private initialization!: Promise<void>;
	private defaultWriter: IQueueWriter;
	initArgs!: WorkerArgs;
	preventStopping = new Set<number>();

	constructor(readonly pipe: Pipe) {
		this.defaultWriter = this.createWriter(0);
	}

	start(commandProcessor: ICommandProcessor) {
		this.commandProcessor = commandProcessor;
		this.pipe.subscribe(this.processMessage);
	}

	stop() {
		this.pipe.unsubscribe(this.processMessage);
		this.pipe.dispose();
		this.commandProcessor.dispose();
	}

	createWriter(sessionId: number): IQueueWriter {
		return new QueueWriter(this, sessionId);
	}


	private processMessage = async (message: WorkerArgsAugmented | { exit: true }) => {
		try {

			if (typeof message !== 'object') {
				return;
			}
			if ('exit' in message) {
				this.stop();
				return;
			}

			// create a writer that is linked to the current session
			// (sent messages will be triaged by session ID)
			const writer = this.createWriter(message.sessionId!);

			// check worker initialization parameters
			const {testFiles, tests, action} = message;
			const sendErrorInfo = (action === 'loadTests');
			if (!this.initArgs) {
				this.initArgs = message;
				this.initialization = this.commandProcessor.initialize(writer, message);
			} else if (!areCompatibleRunners(this.initArgs, message)) {
				this.defaultWriter.sendError('Mocha initialization options have changed. Worker must be reloaded.');
				this.stop();
			}

			// wait for initialization
			try {
				await this.initialization;
			} catch (err) {
				this.defaultWriter.sendInfo(`Caught error ${util.inspect(err)}`);
				if (sendErrorInfo) this.defaultWriter.sendError(err);
			}

			// process action
			if (message.action === 'loadTests') {
				this.commandProcessor.loadTests(writer, testFiles);
			} else if (message.action === 'runTests') {
				this.commandProcessor.runTests(writer, testFiles, tests!);
			} else {
				if (sendErrorInfo) this.defaultWriter.sendError('Worker received an unexpected action: ' + message.action);
				return;
			}
		} catch (e) {
			await this.defaultWriter.sendError(e);
			// this.stop();
		}
	}
}


class QueueWriter implements IQueueWriter {

	constructor(private owner: CommandQueue
		, private sessionId: number) {
	}

	async sendInfo(info: string) {
		if (!this.owner.initArgs || this.owner.initArgs.logEnabled) {
			await this.owner.pipe.write(info);
		}
	}

	async sendError(err: any) {
		await this.sendMessage(<ErrorInfo>{
			type: 'error',
			errorMessage: util.inspect(err)
		});
	}

	async sendMessage(message: any) {
		// enrich mesage with current session ID
		// => messages will be triaged on this ID
		const sid = this.sessionId;
		if (sid) {
			if (message === null) {
				message = {} as any;
			}
			if (typeof message === 'object') {
				message.sessionId = sid;
			}
		}

		// send message
		await this.owner.pipe.write(message);
	}

	preventStopping() {
		this.owner.preventStopping.add(this.sessionId || 0);
	}

	stop() {
		this.owner.preventStopping.delete(this.sessionId || 0);
		if (!this.owner.preventStopping.size) {
			this.owner.stop();
		}
	}
}

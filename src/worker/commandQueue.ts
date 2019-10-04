import { WorkerArgs, ErrorInfo } from 'vscode-test-adapter-remoting-util/out/mocha';
import { deepEqual } from '../util';
import * as util from 'util';

export interface Pipe {
	subscribe(messageProcessor: (messgage: any) => void): void;
	unsubscribe(messageProcessor: (messgage: any) => void): void;
	write(message: any): void | Promise<void>;
	dispose(): void;
}
export interface ICommandProcessor {
	loadTests(testFiles: string[]): void;
	runTests(testFiles: string[], tests: string[]): void;
	initialize(args: WorkerArgs): Promise<void>;
	dispose(): void;
}
export interface ICommandQueue {
	sendInfo(info: string): Promise<void>;
	sendError(err: any): Promise<void>;
	sendMessage(message: any): Promise<void>;
}

export class CommandQueue implements ICommandQueue {
	private commandProcessor!: ICommandProcessor;
	private initArgs!: WorkerArgs;
	private initialization!: Promise<void>;

	constructor(private pipe: Pipe) {
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

	async sendInfo(info: string) {
		if (!this.initArgs || this.initArgs.logEnabled) {
			await this.pipe.write(info);
		}
	}

	async sendError(err: any) {
		await this.pipe.write(<ErrorInfo>{ type: 'error', errorMessage: util.inspect(err) });
	}

	async sendMessage(message: any) {
		await this.pipe.write(message);
	}

	private processMessage = async (message: WorkerArgs | { exit: true }) => {
		if (typeof message !== 'object') {
			return;
		}
		if ('exit' in message) {
			this.stop();
			return;
		}

		// check worker initialization parameters
		const {testFiles, tests, action} = message;
		const sendErrorInfo = (action === 'loadTests');
		if (!this.initArgs) {
			delete message.testFiles;
			delete message.tests;
			delete message.action;
			this.initArgs = message;
			this.initialization = this.commandProcessor.initialize(message);
		} else if (!deepEqual(this.initArgs, message)) {
			this.sendError('Mocha initialization options have changed. Worker must be reloaded.');
			this.stop();
		}

		// wait for initialization
		try {
			await this.initialization;
		} catch (err) {
			this.sendInfo(`Caught error ${util.inspect(err)}`);
			if (sendErrorInfo) this.sendError(err);
		}

		// process action
		if (message.action === 'loadTests') {
			this.commandProcessor.loadTests(testFiles);
		} else if (message.action === 'runTests') {
			this.commandProcessor.runTests(testFiles, tests!);
		} else {
			if (sendErrorInfo) this.sendError('Worker received an unexpected action: ' + message.action);
			return;
		}
	}
}

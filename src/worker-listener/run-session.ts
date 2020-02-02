import { IWorkerInstance, IWorkerSession } from './interfaces';
import { WorkerRunEvent, IAdapterCore } from '../interfaces';
import { TestEvent, TestRunFinishedEvent, TestLoadFinishedEvent } from 'vscode-test-adapter-api';

export class RunSession implements IWorkerSession {

	private runFinished = false;
	private runningTest?: string;
	private triggerEndRun!: () => void;
	private endRun = new Promise<void>(done => this.triggerEndRun = done);

	constructor(private adapter: IAdapterCore
		, private owner: IWorkerInstance) {
	}

	private logInfo(data: any) {
		if (this.adapter.log.enabled) {
			this.adapter.log.info(data);
		}
	}

	onStdout(data: string) {

		this.adapter.outputChannel.append(data);
		if (this.runningTest) {
			this.adapter.testStatesEmitter.fire(<TestEvent>{
				type: 'test',
				state: 'running',
				test: this.runningTest,
				message: data.toString()
			});
		}
	}

	onStderr(data: string) {
		this.onStdout(data);
	}


	waitInitialRun(): Promise<void> {
		return this.endRun;
	}

	waitEnd(): Promise<void> {
		return this.endRun;
	}


	finished(err?: any): void {
		if (this.runFinished) {
			return; // ignore, we've already finished loading
		}

		if (err) {
			this.runningTest = undefined;
			this.adapter.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
		} else {
			this.adapter.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
		}

		this.triggerEndRun();
		this.runFinished = true;
	}

	processMessage(info: WorkerRunEvent) {

		if (info.type === 'error') {
			this.logInfo('Received error from worker');
			this.adapter.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', errorMessage: info.errorMessage });
			return 'stop';
		}

		if (info.type === 'finished') {
			this.finished();
			return 'stop';
		} else {

			this.adapter.testStatesEmitter.fire(info);

			if (info.type === 'test') {
				if (info.state === 'running') {
					this.runningTest = (typeof info.test === 'string')
						? info.test
						: info.test.id;
				} else {
					this.runningTest = undefined;
				}
			}
			return 'continue';
		}
	}

}
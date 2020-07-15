import { WorkerEvent, WorkerRunEvent, WorkerLoadEvent, IAdapterCore, WorkerArgsAugmented } from '../interfaces';
import { TestLoadFinishedEvent, TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { IWorkerSession, IWorkerInstance } from './interfaces';
import * as util from 'util';
import { collectFiles, findTests, workerFailureMessage } from '../util';

export class LoadSession implements IWorkerSession {
	private testsLoaded: boolean = false;

	private triggerEndRun!: () => void;
	private endRun = new Promise<void>(done => this.triggerEndRun = done);

	private triggerEndInitialRun!: () => void;
	private endInitialRun = new Promise<void>(done => this.triggerEndInitialRun = done);
	private isFinished = false;


	constructor(private adapter: IAdapterCore
		, private owner: IWorkerInstance
		, private args: WorkerArgsAugmented
		, private changedFiles?: string[]) {
	}

	private logError(data: any) {
		if (this.adapter.log.enabled) {
			this.adapter.log.error(data);
		}
	}
	private logInfo(data: any) {
		if (this.adapter.log.enabled) {
			this.adapter.log.info(data);
		}
	}

	onStdout(data: string) {
		this.logInfo(data);
	}

	onStderr(data: string) {
		this.logError(data);
	}

	waitInitialRun(): Promise<void> {
		return this.endInitialRun;
	}

	waitEnd(): Promise<void> {
		return this.endRun;
	}

	finished(err?: any) {
		if (this.testsLoaded) {
			return; // ignore, we've already finished loading
		}

		if (!this.isFinished) {
			if (err) {
				this.adapter.testsEmitter.fire(<TestLoadFinishedEvent>{
					type: 'finished',
					 errorMessage: workerFailureMessage(err, this.args.debuggerPort)
				});
			} else {
				this.adapter.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: undefined });
			}
		}

		this.triggerEndInitialRun();
		this.triggerEndRun();
		this.testsLoaded = true;
	}



	processMessage(info: WorkerLoadEvent): 'stop' | 'continue' {

		if (info.type === 'error') {
			this.isFinished = true;
			this.logInfo('Received error from worker');
			this.adapter.testsEmitter.fire(<TestLoadFinishedEvent>{
				type: 'finished',
				errorMessage: info.errorMessage,
			});
			return 'stop';
		}

		if (info.type === 'noTest') {
			this.logInfo('Worker found no tests');
			this.adapter.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished' });
			return 'stop';
		}



		if (info.type !== 'suite') {
			return 'continue';
		}

		this.logInfo('Received tests from worker');
		info.id = `${this.adapter.workspaceFolderPath}: Mocha`;
		info.label = 'Mocha';
		this.collectNodesById(info);

		this.adapter.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: info });


		if (info.hotReload) {
			this.owner.detectedHmr();
			this.changedFiles = [...collectFiles(info, x => !!x.hotReload)];
		} else {
			this.isFinished = true;
		}

		if (this.changedFiles) {
			const changedTests = findTests(info, {
				tests:
					info => ((info.file !== undefined) && (this.changedFiles!.indexOf(info.file) >= 0))
			});
			const tests = [...changedTests].map(info => info.id);
			this.adapter.retireEmitter.fire({ tests })

		} else {
			this.adapter.retireEmitter.fire({});
		}

		// Stop process if not HMR
		return info.hotReload
			? 'continue'
			: 'stop';
	}


	private collectNodesById(info: TestSuiteInfo | TestInfo): void {
		this.adapter.nodesById.set(info.id, info);
		if (info.type === 'suite') {
			for (const child of info.children) {
				this.collectNodesById(child);
			}
		}
	}
}
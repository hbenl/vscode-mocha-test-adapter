import * as path from 'path';
import * as vscode from 'vscode';
import { ChildProcess, fork } from 'child_process';
import * as util from 'util';
import { TestSuiteInfo, TestEvent, TestInfo, TestSuiteEvent, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, RetireEvent } from 'vscode-test-adapter-api';
import { ErrorInfo, WorkerArgs } from 'vscode-test-adapter-remoting-util/out/mocha';
import { findTests, stringsOnly, collectFiles } from './util';
import { AdapterConfig } from './configReader';
import { IWorkerInstance } from './worker-listener/interfaces';
import { WorkerInstance } from './worker-listener/listener-instance';
import { IAdapterCore, IEventEmitter, IOutputChannel, ILog, WorkerArgsAugmented } from './interfaces';

export interface IDisposable {
	dispose(): void;
}

export interface IConfigReader {
	reloadConfig(): void;
	readonly currentConfig: Promise<AdapterConfig | undefined>;
}

export abstract class MochaAdapterCore implements IAdapterCore {

	abstract readonly workspaceFolderPath: string;

	protected abstract readonly configReader: IConfigReader;

	abstract readonly testsEmitter: IEventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>;
	abstract readonly testStatesEmitter: IEventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>;
	abstract readonly retireEmitter: IEventEmitter<RetireEvent>;

	protected abstract startDebugging(config: AdapterConfig): Promise<any>;
	protected abstract onDidTerminateDebugSession(cb: (session: any) => any): IDisposable;

	readonly nodesById = new Map<string, TestSuiteInfo | TestInfo>();

	private readonly workerScript = require.resolve('../out/worker/bundle.js');

	private allWorkers: IWorkerInstance[] = [];

	private hmrWorker?: IWorkerInstance;

	constructor(
		readonly outputChannel: IOutputChannel,
		readonly log: ILog
	) { }

	private createWorker(config: AdapterConfig): IWorkerInstance {
		const childProcScript = config.launcherScript
			? path.resolve(this.workspaceFolderPath, config.launcherScript)
			: this.workerScript;
		const ret = new WorkerInstance(this
			, config
			, childProcScript);

		this.allWorkers.push(ret);
		ret.onExit(() => {
			if (this.hmrWorker === ret) {
				this.hmrWorker = undefined;
			}
			const i = this.allWorkers.indexOf(ret);
			if (i >= 0) {
				this.allWorkers.splice(i, 1);
			}
		});
		return ret;
	}

	async load(changedFiles?: string[]): Promise<void> {

		try {
			if (this.log.enabled) this.log.info(`Loading test files of ${this.workspaceFolderPath}`);

			// load config
			this.configReader.reloadConfig();
			const config = await this.configReader.currentConfig;
			if (!config) {
				this.log.info('Adapter disabled for this folder, loading cancelled');
				this.nodesById.clear();
				this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished' });
				return;
			}

			// check config
			if (config.hmrBundle) {
				if (config.files && config.files.length) {
					throw new Error('"mochaExplorer.hmrBundle" is not compatible with "mochaExplorer.files" or with a mocha config file');
				}
				if (config.launcherScript) {
					throw new Error('"mochaExplorer.enableHmr" is not compatible with "mochaExplorer.workerScript');
				}
				if (config.mochaOpts.exit) {
					throw new Error('"mochaExplorer.enableHmr" is not compatible with "mochaOpts.exit"');
				}
			}


			// an HMR worker is running
			if (config.hmrBundle) {
				// when HMR running, then ignore file changes
				if (changedFiles) {
					return;
				}

				// kill previous workers (this forces a fresh worker reload)
				for (const w of this.allWorkers) {
					w.kill();
				}
			}

			this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });

			// create brand new worker
			const worker = this.createWorker(config);

			// if HMR is enabled, then try to detect HMR
			// when detected, then next runs will re-use this worker
			if (config.hmrBundle) {
				worker.onDetectHmr(() => {
					// stop previous worker (should not happen)
					if (this.hmrWorker) {
						this.hmrWorker.kill();
					}

					// store it for reuse
					this.hmrWorker = worker;
				});
			}

			// launch test scanning
			const args: WorkerArgsAugmented = {
				action: 'loadTests',
				cwd: config.cwd,
				testFiles: config.hmrBundle ? [config.hmrBundle] : config.files,
				env: config.env,
				mochaPath: config.mochaPath,
				mochaOpts: config.mochaOpts,
				monkeyPatch: config.monkeyPatch,
				logEnabled: this.log.enabled,
				workerScript: this.workerScript,
				enableHmr: !!config.hmrBundle,
				skipFrames: config.skipFrames,
			};
			this.nodesById.clear();
			const session = worker.execute(args, changedFiles);

			// wait until all tests have ben scanned
			// nb: session will continue after that when enabled HMR
			await session.waitInitialRun();

		} catch (err) {
			if (this.log.enabled) this.log.error(`Error while loading tests: ${util.inspect(err)}`);
			this.testsEmitter.fire(<TestLoadFinishedEvent>{
				type: 'finished',
				errorMessage: `Unexpected error in the worker intialization 😨

Please file an issue here: https://github.com/oguimbal/vscode-mocha-test-adapter/issues

===== ERROR DETAILS ========

${util.inspect(err)}`,
			});
		}
	}


	async run(testsToRun: string[], attachDebugger?: (worker: IWorkerInstance) => Promise<boolean>): Promise<void> {

		try {

			if (this.log.enabled) this.log.info(`Running test(s) ${JSON.stringify(testsToRun)} of ${this.workspaceFolderPath}`);

			const config = await this.configReader.currentConfig;

			if (!config) {
				this.log.info('Adapter disabled for this folder, running cancelled');
				return;
			}

			this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests: testsToRun });

			const testInfos: TestInfo[] = [];
			for (const suiteOrTestId of testsToRun) {
				const node = this.nodesById.get(suiteOrTestId);
				if (node) {
					this.collectTests(node, testInfos);
				}
			}
			const tests = testInfos.map(test => {
				const separatorIndex = test.id.indexOf(': ');
				if (separatorIndex >= 0) {
					return test.id.substr(separatorIndex + 2);
				} else {
					return test.id;
				}
			});

			let _testFiles: string[] | undefined = config.hmrBundle ? [config.hmrBundle] : undefined;
			if (!_testFiles && config.pruneFiles) {
				const testFileSet = new Set(testInfos.map(test => test.file).filter(file => (file !== undefined)));
				if (testFileSet.size > 0) {
					_testFiles = <string[]>[...testFileSet];
					if (this.log.enabled) this.log.debug(`Using test files ${JSON.stringify(_testFiles)}`);
				}
			}
			if (_testFiles === undefined) {
				_testFiles = config.files;
			}
			const testFiles = _testFiles;

			// build worker args
			const args: WorkerArgsAugmented = {
				action: 'runTests',
				cwd: config.cwd,
				testFiles,
				tests,
				env: config.env,
				mochaPath: config.mochaPath,
				mochaOpts: config.mochaOpts,
				logEnabled: this.log.enabled,
				workerScript: this.workerScript,
				enableHmr: !!config.hmrBundle,
				skipFrames: config.skipFrames,
			};
			if (attachDebugger && !config.hmrBundle) {
				args.debuggerPort = config.debuggerPort;
			}

			// get a worker (Running HMR worker, or a brand new worker process)
			let worker: IWorkerInstance | null = null;
			if (this.hmrWorker) {
				if (this.hmrWorker.accepts(args)) {
					worker = this.hmrWorker;
				} else if (this.log.enabled) {
					this.log.info('The test run config is not compatible with the current HMR worker => launching a new worker instance');
				}
			}
			if (!worker) {
				worker = this.createWorker(config);
			}

			// pre-launch
			worker.spawn(!!attachDebugger);

			// try to attach debugger
			if (attachDebugger) {
				if (!(await attachDebugger(worker))) {
					// if it fails, then kill this worker (if it is not reusable)
					if (this.hmrWorker !== worker) {
						worker.kill();
					}
				}
			}

			// launch
			const session = worker.execute(args);

			// wait until everything has ben run
			await session.waitEnd();

		} catch (err) {
			if (this.log.enabled) this.log.error(`Error while running tests: ${util.inspect(err)}`);
			this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
		}
	}

	async debug(testsToRun: string[]): Promise<void> {

		if (this.log.enabled) this.log.info(`Debugging test(s) ${JSON.stringify(testsToRun)} of ${this.workspaceFolderPath}`);

		const config = await this.configReader.currentConfig;

		if (!config) {
			this.log.info('Adapter disabled for this folder, debugging cancelled');
			return;
		}

		let debugSession: vscode.DebugSession | undefined = undefined;
		const testRunPromise = this.run(testsToRun, async (worker) => {
			this.log.info('Starting the debug session');
			try {
				debugSession = await this.startDebugging(config);
			} catch (err) {
				this.log.error('Failed starting the debug session - aborting', err);
				return false;
			}

			const subscription = this.onDidTerminateDebugSession((session) => {
				if (debugSession != session) return;
				this.log.info('Debug session ended');
				// terminate the test run
				if (!config.hmrBundle) {
					worker.kill();
				}
				subscription.dispose();
			});
			return true;
		});

		// wait test run
		await testRunPromise;

		// disconnect debug session (required for HMR because process does not terminate)
		if (debugSession && debugSession!.customRequest) {
			// see commands https://github.com/microsoft/vscode-debugadapter-node/blob/e846173f28c6cd23e6e2eb1b78a8b90d8b0b3de9/adapter/src/debugSession.ts
			await debugSession!.customRequest('disconnect');
		}
	}

	cancel(): void {
		this.log.info('Killing running test processes');
		for (const w of this.allWorkers) {
			w.kill();
		}
		this.allWorkers = [];
	}


	private collectTests(info: TestSuiteInfo | TestInfo, tests: TestInfo[]): void {
		if (info.type === 'suite') {
			for (const child of info.children) {
				this.collectTests(child, tests);
			}
		} else {
			tests.push(info);
		}
	}
}

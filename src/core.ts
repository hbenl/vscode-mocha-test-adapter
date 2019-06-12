import * as path from 'path';
import { ChildProcess, fork } from 'child_process';
import * as util from 'util';
import { TestSuiteInfo, TestEvent, TestInfo, TestSuiteEvent, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, RetireEvent } from 'vscode-test-adapter-api';
import { ErrorInfo, WorkerArgs } from 'vscode-test-adapter-remoting-util/out/mocha';
import { findTests, stringsOnly } from './util';
import { AdapterConfig } from './configReader';

export interface IDisposable {
	dispose(): void;
}

export interface IEventEmitter<T> {
	fire(event: T): void;
}

export interface IOutputChannel {
	append(msg: string): void;
}

export interface IConfigReader {
	reloadConfig(): void;
	readonly currentConfig: Promise<AdapterConfig | undefined>;
}

export interface ILog {
	readonly enabled: boolean;
	debug(...msg: any[]): void;
	info(...msg: any[]): void;
	warn(...msg: any[]): void;
	error(...msg: any[]): void;
}

export abstract class MochaAdapterCore {

	protected abstract readonly workspaceFolderPath: string;

	protected abstract readonly configReader: IConfigReader;

	protected abstract readonly testsEmitter: IEventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>;
	protected abstract readonly testStatesEmitter: IEventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>;
	protected abstract readonly retireEmitter: IEventEmitter<RetireEvent>;

	protected abstract startDebugging(config: AdapterConfig): Promise<any>;
	protected abstract onDidTerminateDebugSession(cb: (session: any) => any): IDisposable;

	protected readonly nodesById = new Map<string, TestSuiteInfo | TestInfo>();

	private readonly workerScript = require.resolve('../out/worker/bundle.js');

	private runningTestProcess: ChildProcess | undefined;

	constructor(
		protected readonly outputChannel: IOutputChannel,
		protected readonly log: ILog
	) {}

	async load(changedFiles?: string[]): Promise<void> {

		try {

			if (this.log.enabled) this.log.info(`Loading test files of ${this.workspaceFolderPath}`);

			this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });

			this.configReader.reloadConfig();
			const config = await this.configReader.currentConfig;

			if (!config) {
				this.log.info('Adapter disabled for this folder, loading cancelled');
				this.nodesById.clear();
				this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished' });
				return;
			}

			let testsLoaded = false;

			await new Promise<void>(resolve => {

				const childProcScript = config.launcherScript ?
					path.resolve(this.workspaceFolderPath, config.launcherScript) :
					this.workerScript;

				const childProc = fork(
					childProcScript,
					[],
					{
						execPath: config.nodePath,
						execArgv: [], // ['--inspect-brk=12345']
						env: stringsOnly({ ...process.env, ...config.env }),
						stdio: [ 'pipe', 'pipe', 'pipe', 'ipc' ]
					}
				);

				const args: WorkerArgs = {
					action: 'loadTests',
					cwd: config.cwd,
					testFiles: config.files,
					env: config.env,
					mochaPath: config.mochaPath,
					mochaOpts: config.mochaOpts,
					monkeyPatch: config.monkeyPatch,
					logEnabled: this.log.enabled,
					workerScript: this.workerScript
				};
				childProc.send(args);

				childProc.on('message', (info: string | TestSuiteInfo | ErrorInfo | null) => {

					if (typeof info === 'string') {

						if (this.log.enabled) this.log.info(`Worker: ${info}`);

					} else {

						this.nodesById.clear();

						if (info) {

							if (info.type === 'suite') {

								this.log.info('Received tests from worker');
								info.id = `${this.workspaceFolderPath}: Mocha`;
								info.label = 'Mocha';
								this.collectNodesById(info);
								this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: info });

								if (changedFiles) {

									const changedTests = findTests(info, { tests:
										info => ((info.file !== undefined) && (changedFiles.indexOf(info.file) >= 0))
									});
									this.retireEmitter.fire({ tests: [ ...changedTests ].map(info => info.id) })

								} else {
									this.retireEmitter.fire({});
								}

							} else { // info.type === 'error'

								this.log.info('Received error from worker');
								this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', errorMessage: info.errorMessage });

							}

						} else {

							this.log.info('Worker found no tests');
							this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished' });

						}

						testsLoaded = true;
						resolve();
					}
				});

				if (this.log.enabled) {
					childProc.stdout.on('data', data => this.log.info(data.toString()));
					childProc.stderr.on('data', data => this.log.error(data.toString()));
				}

				childProc.on('exit', (code, signal) => {
					if (this.log.enabled) this.log.info(`Worker finished with code ${code} and signal ${signal}`);
					if (!testsLoaded) {
						if (code || signal) {
							this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', errorMessage: `The worker process finished with code ${code} and signal ${signal}` });
						} else {
							this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: undefined });
						}
						resolve();
					}
				});

				childProc.on('error', err => {
					if (this.log.enabled) this.log.error(`Error from child process: ${util.inspect(err)}`);
					if (!testsLoaded) {
						this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', errorMessage: util.inspect(err) });
						resolve();
					}
				});
			});

		} catch (err) {
			if (this.log.enabled) this.log.error(`Error while loading tests: ${util.inspect(err)}`);
			this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', errorMessage: util.inspect(err) });
		}
	}

	async run(testsToRun: string[], debug = false): Promise<void> {

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

			let _testFiles: string[] | undefined = undefined;
			if (config.pruneFiles) {
				const testFileSet = new Set(testInfos.map(test => test.file).filter(file => (file !== undefined)));
				if (testFileSet.size > 0) {
					_testFiles = <string[]>[ ...testFileSet ];
					if (this.log.enabled) this.log.debug(`Using test files ${JSON.stringify(_testFiles)}`);
				}
			}
			if (_testFiles === undefined) {
				_testFiles = config.files;
			}
			const testFiles = _testFiles;

			let childProcessFinished = false;

			await new Promise<void>(resolve => {

				let runningTest: string | undefined = undefined;

				const childProcScript = config.launcherScript ?
					path.resolve(this.workspaceFolderPath, config.launcherScript) :
					this.workerScript;

				const execArgv = (debug && !config.launcherScript) ? [ `--inspect-brk=${config.debuggerPort}` ] : [];

				this.runningTestProcess = fork(
					childProcScript,
					[],
					{
						execPath: config.nodePath,
						execArgv,
						env: stringsOnly({ ...process.env, ...config.env }),
						stdio: [ 'pipe', 'pipe', 'pipe', 'ipc' ]
					}
				);

				const args: WorkerArgs = {
					action: 'runTests',
					cwd: config.cwd,
					testFiles,
					tests,
					env: config.env,
					mochaPath: config.mochaPath,
					mochaOpts: config.mochaOpts,
					logEnabled: this.log.enabled,
					workerScript: this.workerScript,
					debuggerPort: debug ? config.debuggerPort : undefined
				};
				this.runningTestProcess.send(args);

				this.runningTestProcess.on('message', (message: string | TestSuiteEvent | TestEvent) => {

					if (typeof message === 'string') {

						if (this.log.enabled) this.log.info(`Worker: ${message}`);

					} else {

						if (this.log.enabled) this.log.info(`Received ${JSON.stringify(message)}`);

						this.testStatesEmitter.fire(message);

						if (message.type === 'test') {
							if (message.state === 'running') {
								runningTest = (typeof message.test === 'string') ? message.test : message.test.id;
							} else {
								runningTest = undefined;
							}
						}
					}
				});

				const processOutput = (data: Buffer | string) => {

					this.outputChannel.append(data.toString());

					if (runningTest) {
						this.testStatesEmitter.fire(<TestEvent>{
							type: 'test',
							state: 'running',
							test: runningTest,
							message: data.toString()
						});
					}
				}

				this.runningTestProcess.stdout.on('data', processOutput);
				this.runningTestProcess.stderr.on('data', processOutput);

				this.runningTestProcess.on('exit', () => {
					this.log.info('Worker finished');
					runningTest = undefined;
					this.runningTestProcess = undefined;
					if (!childProcessFinished) {
						childProcessFinished = true;
						this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
						resolve();
					}
				});

				this.runningTestProcess.on('error', err => {
					if (this.log.enabled) this.log.error(`Error from child process: ${util.inspect(err)}`);
					runningTest = undefined;
					this.runningTestProcess = undefined;
					if (!childProcessFinished) {
						childProcessFinished = true;
						this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
						resolve();
					}
				});
			});

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

		const testRunPromise = this.run(testsToRun, true);

		this.log.info('Starting the debug session');
		let debugSession: any;
		try {
			debugSession = await this.startDebugging(config);
		} catch (err) {
			this.log.error('Failed starting the debug session - aborting', err);
			this.cancel();
			return;
		}

		const subscription = this.onDidTerminateDebugSession((session) => {
			if (debugSession != session) return;
			this.log.info('Debug session ended');
			this.cancel(); // terminate the test run
			subscription.dispose();
		});

		await testRunPromise;
	}

	cancel(): void {
		if (this.runningTestProcess) {
			this.log.info('Killing running test process');
			this.runningTestProcess.kill();
		}
	}

	private collectNodesById(info: TestSuiteInfo | TestInfo): void {
		this.nodesById.set(info.id, info);
		if (info.type === 'suite') {
			for (const child of info.children) {
				this.collectNodesById(child);
			}
		}
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

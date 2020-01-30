import * as path from 'path';
import { Glob } from 'glob';
import { TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestSuiteInfo, RetireEvent } from 'vscode-test-adapter-api';
import { MochaAdapterCore, IConfigReader, IEventEmitter, IDisposable, IOutputChannel, ILog } from '../core';
import { MochaOpts } from 'vscode-test-adapter-remoting-util/out/mocha';
import { MochaOptsReader } from '../optsReader';
import { AdapterConfig, EnvVars } from '../configReader';

export async function createTestMochaAdapter(
	workspaceName: string,
	opts?: {
		monkeyPatch?: boolean,
		env?: EnvVars,
		pruneFiles?: boolean
	}
): Promise<TestMochaAdapter> {

	const workspaceFolderPath = path.resolve(__dirname, 'workspaces/' + workspaceName);
	const optsFilePath = path.join(workspaceFolderPath, 'test/mocha.opts');

	const optsReader = new MochaOptsReader(new TestLog());
	const mochaOptsAndFiles = await optsReader.readMochaOptsFile(optsFilePath);
	const mochaOpts: MochaOpts = {
		ui: mochaOptsAndFiles.mochaOpts.ui || 'bdd',
		timeout: mochaOptsAndFiles.mochaOpts.timeout || 1000,
		retries: mochaOptsAndFiles.mochaOpts.retries || 0,
		requires: mochaOptsAndFiles.mochaOpts.requires || [],
		exit: mochaOptsAndFiles.mochaOpts.exit || false,
		files: mochaOptsAndFiles.mochaOpts.files || [],
	};
	const relativeGlob = mochaOptsAndFiles.globs[0] || 'test/**/*.js';
	const absoluteGlob = path.resolve(workspaceFolderPath, relativeGlob);
	const files = await findFiles(absoluteGlob);

	const monkeyPatch = (opts && (opts.monkeyPatch !== undefined)) ? opts.monkeyPatch : true;
	const env = (opts && opts.env) ? opts.env : {};
	const pruneFiles = (opts && opts.pruneFiles) || false;

	const config = {

		nodePath: undefined,
		mochaPath: path.dirname(require.resolve('mocha')),
		cwd: workspaceFolderPath,
		env,

		monkeyPatch,
		pruneFiles,

		debuggerPort: 9229,
		debuggerConfig: undefined,

		mochaOpts,
		files,

		mochaOptsFile: optsFilePath,
		envFile: undefined,
		globs: mochaOptsAndFiles.globs,

		launcherScript: undefined
	};

	return new TestMochaAdapter(workspaceFolderPath, new TestConfigReader(config));
}

export class TestMochaAdapter extends MochaAdapterCore {

	protected activeDebugSession: any;

	constructor(
		protected readonly workspaceFolderPath: string,
		protected readonly configReader: IConfigReader,
		protected readonly testsEmitter = new TestEventCollector<TestLoadStartedEvent | TestLoadFinishedEvent>(),
		protected readonly testStatesEmitter = new TestEventCollector<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>(),
		protected readonly retireEmitter = new TestEventCollector<RetireEvent>()
	) {
		super(new TestOutputChannel(), new TestLog());
	}

	getTestLoadFinishedEvent(): TestLoadFinishedEvent | undefined {
		for (const testLoadEvent of this.testsEmitter.events) {
			if (testLoadEvent.type === 'finished') {
				return testLoadEvent;
			}
		}
		return undefined;
	}

	getLoadedTests(): TestSuiteInfo | undefined {
		for (const testLoadEvent of this.testsEmitter.events) {
			if (testLoadEvent.type === 'finished') {
				return testLoadEvent.suite;
			}
		}
		return undefined;
	}

	getTestRunEvents(): (TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent)[] {
		return this.testStatesEmitter.events;
	}

	getTestsThatWereRun(): { id: string, result: 'passed' | 'failed' | 'skipped' | 'errored' }[] {
		return this.getTestRunEvents()
			.filter(event => ((event.type === 'test') && (event.state !== 'running')))
			.map(event => {
				let id = (event as TestEvent).test as string;
				id = id.substr(id.indexOf(':') + 2);
				const result = (event as TestEvent).state as 'passed' | 'failed' | 'skipped' | 'errored';
				return { id, result };
			});
	}

	getMessages(): string[] {
		return (this.outputChannel as TestOutputChannel).messages;
	}

	protected startDebugging(config: AdapterConfig): Promise<boolean> {
		return Promise.resolve(false);
	}

	protected onDidTerminateDebugSession(cb: (session: any) => void): IDisposable {
		return { dispose() {} };
	}
}

export class TestConfigReader implements IConfigReader {

	config: AdapterConfig;

	get currentConfig(): Promise<AdapterConfig> {
		return Promise.resolve(this.config);
	}

	constructor(initialConfig: AdapterConfig) {
		this.config = initialConfig;
	}

	reloadConfig(): void {}
}

export class TestEventCollector<T> implements IEventEmitter<T> {

	readonly events: T[] = [];

	fire(event: T): void {
		delete (event as any).description;
		this.events.push(event);
	}
}

class TestOutputChannel implements IOutputChannel {

	readonly messages: string[] = [];

	append(msg: string): void {
		this.messages.push(msg);
	}
}

export class TestLog implements ILog {
	readonly enabled = false;
	debug(...msg: any[]): void {
	}
	info(...msg: any[]): void {
	}
	warn(...msg: any[]): void {
	}
	error(...msg: any[]): void {
	}
}

async function findFiles(glob: string): Promise<string[]> {
	return new Promise<string[]>((resolve, reject) => {
		new Glob(glob, (err, files) => {
			if (err) {
				reject(err);
			} else {
				resolve(files);
			}
		})
	})
}

import * as path from 'path';
import { glob } from 'glob';
import { TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestSuiteInfo, RetireEvent } from 'vscode-test-adapter-api';
import { MochaAdapterCore, IConfigReader, IEventEmitter, IDisposable, IOutputChannel, ILog } from '../core';
import { MochaOpts } from 'vscode-test-adapter-remoting-util/out/mocha';
import { MochaOptsReader } from '../optsReader';
import { AdapterConfig, EnvVars } from '../configReader';
import { normalizePath } from '../util';

export async function createTestMochaAdapter(
	workspaceName: string,
	opts?: {
		monkeyPatch?: boolean,
		multiFileSuites?: boolean,
		env?: EnvVars,
		pruneFiles?: boolean,
		esmLoader?: boolean
	}
): Promise<TestMochaAdapter> {

	const workspaceFolderPath = normalizePath(path.resolve(__dirname, 'workspaces/' + workspaceName));

	const optsReader = new MochaOptsReader(new TestLog());
	const mochaOptsAndFiles = await optsReader.readOptsUsingMocha(workspaceFolderPath);
	const mochaOpts: MochaOpts = {
		ui: mochaOptsAndFiles.mochaOpts.ui || 'bdd',
		timeout: mochaOptsAndFiles.mochaOpts.timeout || 1000,
		retries: mochaOptsAndFiles.mochaOpts.retries || 0,
		requires: mochaOptsAndFiles.mochaOpts.requires || [],
		delay: mochaOptsAndFiles.mochaOpts.delay || false,
		fullTrace: mochaOptsAndFiles.mochaOpts.fullTrace || false,
		exit: mochaOptsAndFiles.mochaOpts.exit || false,
		asyncOnly: mochaOptsAndFiles.mochaOpts.asyncOnly || false,
		parallel: mochaOptsAndFiles.mochaOpts.parallel || false,
		jobs: mochaOptsAndFiles.mochaOpts.jobs
	};
	const relativeGlob = mochaOptsAndFiles.globs[0] || 'test/**/*.js';
	const absoluteGlob = path.resolve(workspaceFolderPath, relativeGlob);
	const testFiles = await findFiles(absoluteGlob);
	const extraFiles = mochaOptsAndFiles.files.map(file => path.resolve(workspaceFolderPath, file));
	const monkeyPatch = (opts && (opts.monkeyPatch !== undefined)) ? opts.monkeyPatch : true;
	const multiFileSuites = (opts && opts.multiFileSuites) || false;
	const env = (opts && opts.env) ? opts.env : {};
	const pruneFiles = (opts && opts.pruneFiles) || false;
	const esmLoader = (opts && (opts.esmLoader !== undefined)) ? opts.esmLoader : true;

	const config: AdapterConfig = {

		nodePath: undefined,
		nodeArgv: [],
		mochaPath: normalizePath(path.dirname(require.resolve('mocha'))),
		cwd: workspaceFolderPath,
		env,

		monkeyPatch,
		multiFileSuites,
		pruneFiles,

		debuggerPort: 9229,
		debuggerConfig: undefined,

		mochaOpts,
		testFiles,
		extraFiles,

		mochaConfigFile: undefined,
		packageFile: undefined,
		mochaOptsFile: undefined,
		envFile: undefined,
		globs: mochaOptsAndFiles.globs,
		ignores: mochaOptsAndFiles.ignores,

		esmLoader,

		launcherScript: undefined,
		ipcRole: undefined,
		ipcPort: 9449,
		ipcHost: 'localhost',
		ipcTimeout: 5000,

		autoload: true
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
				id = id.substr(id.lastIndexOf(':') + 2);
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
		return { dispose() { } };
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

	reloadConfig(): void { }
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

async function findFiles(globPattern: string): Promise<string[]> {
	const files = await glob(globPattern, { windowsPathsNoEscape: true });
	return files.map(normalizePath).sort();
}

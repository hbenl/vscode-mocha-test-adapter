import * as path from 'path';
import { TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestSuiteInfo } from 'vscode-test-adapter-api';
import { MochaAdapterCore, IConfigReader, IEventEmitter, IDisposable, IOutputChannel, ILog } from '../core';
import { AdapterConfig } from '../configReader';

export function createTestMochaAdapter(workspaceName: string, testFiles: string[]): TestMochaAdapter {

	const workspaceFolderPath = path.resolve(__dirname, './workspaces/' + workspaceName);

	const config = {

		nodePath: undefined,
		mochaPath: require.resolve('mocha'),
		cwd: workspaceFolderPath,
		env: {},

		monkeyPatch: true,
		pruneFiles: false,

		debuggerPort: 9229,
		debuggerConfig: undefined,

		mochaOpts: {
			ui: 'bdd',
			requires: [],
			retries: 0,
			timeout: 1000,
			exit: false
		},
		files: testFiles.map(file => path.join(workspaceFolderPath, file)),

		mochaOptsFile: undefined,
		globs: []
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
		protected readonly autorunEmitter = new TestEventCollector<void>()
	) {
		super(new TestOutputChannel(), new TestLog());
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
}

export class TestEventCollector<T> implements IEventEmitter<T> {

	readonly events: T[] = [];

	fire(event: T): void {
		this.events.push(event);
	}
}

class TestOutputChannel implements IOutputChannel {
	append(msg: string): void {
	}
}

class TestLog implements ILog {
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

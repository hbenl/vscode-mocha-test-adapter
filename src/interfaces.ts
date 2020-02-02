
import { WorkerArgs, ErrorInfo } from 'vscode-test-adapter-remoting-util/out/mocha';
import { TestSuiteInfo, TestSuiteEvent, TestEvent, TestRunFinishedEvent, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, RetireEvent, TestInfo } from 'vscode-test-adapter-api';

export interface WorkerArgsAugmented extends WorkerArgs {
	enableHmr?: boolean;
	sessionId?: number;
	skipFrames?: string[];
}

export interface NoTestFoundEvent {
	type: 'noTest';
}

export type  WorkerLoadEvent = (TestSuiteInfo
	| NoTestFoundEvent
	| ErrorInfo)
	& { sessionId?: number };

export type WorkerRunEvent = (TestSuiteEvent
	| TestEvent
	| TestRunFinishedEvent
	| ErrorInfo)
	& { sessionId?: number };

export type WorkerEvent = WorkerRunEvent | WorkerLoadEvent;


export interface IEventEmitter<T> {
	fire(event: T): void;
}

export interface IOutputChannel {
	append(msg: string): void;
}

export interface ILog {
	readonly enabled: boolean;
	debug(...msg: any[]): void;
	info(...msg: any[]): void;
	warn(...msg: any[]): void;
	error(...msg: any[]): void;
}

export interface IAdapterCore {
	readonly log: ILog;
	readonly workspaceFolderPath: string;
	readonly outputChannel: IOutputChannel;
	readonly testsEmitter: IEventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>;
	readonly testStatesEmitter: IEventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>;
	readonly retireEmitter: IEventEmitter<RetireEvent>;
	readonly nodesById: Map<string, TestSuiteInfo | TestInfo>;
}
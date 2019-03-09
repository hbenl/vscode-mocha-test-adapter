import * as vscode from 'vscode';
import { TestAdapter, TestEvent, TestSuiteEvent, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { ConfigReader, AdapterConfig } from './configReader';
import { MochaAdapterCore, IDisposable } from './core';

export class MochaAdapter extends MochaAdapterCore implements TestAdapter, IDisposable {

	protected readonly configReader: ConfigReader;

	private disposables: IDisposable[] = [];

	protected readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
	protected readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
	protected readonly autorunEmitter = new vscode.EventEmitter<void>();

	get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
		return this.testsEmitter.event;
	}

	get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> {
		return this.testStatesEmitter.event;
	}

	get autorun(): vscode.Event<void> {
		return this.autorunEmitter.event;
	}

	protected get workspaceFolderPath(): string {
		return this.workspaceFolder.uri.fsPath;
	}

	protected get activeDebugSession(): vscode.DebugSession | undefined {
		return vscode.debug.activeDebugSession;
	}

	constructor(
		public readonly workspaceFolder: vscode.WorkspaceFolder,
		outputChannel: vscode.OutputChannel,
		log: Log
	) {
		super(outputChannel, log);

		this.configReader = new ConfigReader(workspaceFolder, () => this.load(), () => this.autorunEmitter.fire(), log);
		this.disposables.push(this.configReader);

		this.disposables.push(this.testsEmitter);
		this.disposables.push(this.testStatesEmitter);
		this.disposables.push(this.autorunEmitter);

	}

	protected async startDebugging(config: AdapterConfig): Promise<boolean> {

		const result = await vscode.debug.startDebugging(this.workspaceFolder, config.debuggerConfig || {
			name: 'Debug Mocha Tests',
			type: 'node',
			request: 'attach',
			port: config.debuggerPort,
			protocol: 'inspector',
			timeout: 30000,
			stopOnEntry: false
		});

		// workaround for Microsoft/vscode#70125
		await new Promise(resolve => setImmediate(resolve));

		return result;
	}

	protected onDidTerminateDebugSession(cb: (session: vscode.DebugSession) => any): vscode.Disposable {
		return vscode.debug.onDidTerminateDebugSession(cb);
	}

	dispose(): void {
		this.cancel();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
		this.nodesById.clear();
	}
}

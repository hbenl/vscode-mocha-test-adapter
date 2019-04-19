import * as vscode from 'vscode';
import { TestAdapter, TestEvent, TestSuiteEvent, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, RetireEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { ConfigReader, AdapterConfig } from './configReader';
import { MochaAdapterCore, IDisposable } from './core';

export class MochaAdapter extends MochaAdapterCore implements TestAdapter, IDisposable {

	protected readonly configReader: ConfigReader;

	private disposables: IDisposable[] = [];

	protected readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
	protected readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
	protected readonly retireEmitter = new vscode.EventEmitter<RetireEvent>();

	get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
		return this.testsEmitter.event;
	}

	get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> {
		return this.testStatesEmitter.event;
	}

	get retire(): vscode.Event<RetireEvent> {
		return this.retireEmitter.event;
	}

	protected get workspaceFolderPath(): string {
		return this.workspaceFolder.uri.fsPath;
	}

	constructor(
		public readonly workspaceFolder: vscode.WorkspaceFolder,
		workspaceState: vscode.Memento,
		outputChannel: vscode.OutputChannel,
		log: Log
	) {
		super(outputChannel, log);

		this.configReader = new ConfigReader(
			workspaceFolder,
			workspaceState,
			(changedFiles?: string[]) => this.load(changedFiles),
			(tests?: string[]) => this.retireEmitter.fire({ tests }),
			log
		);
		this.disposables.push(this.configReader);

		this.disposables.push(this.testsEmitter);
		this.disposables.push(this.testStatesEmitter);
		this.disposables.push(this.retireEmitter);

	}

	async enable(): Promise<void> {
		await this.configReader.enableAdapter();
		this.load();
	}

	async disable(): Promise<void> {
		await this.configReader.disableAdapter();
		this.load();
	}

	protected async startDebugging(config: AdapterConfig): Promise<vscode.DebugSession> {

		const debuggerConfigName = config.debuggerConfig || 'Debug Mocha Tests';
		const debuggerConfig = config.debuggerConfig || {
			name: debuggerConfigName,
			type: 'node',
			request: 'attach',
			port: config.debuggerPort,
			protocol: 'inspector',
			timeout: 30000,
			stopOnEntry: false
		};

		const debugSessionPromise = new Promise<vscode.DebugSession>((resolve, reject) => {

			let subscription: vscode.Disposable | undefined;
			subscription = vscode.debug.onDidStartDebugSession(debugSession => {
				if ((debugSession.name === debuggerConfigName) && subscription) {
					resolve(debugSession);
					subscription.dispose();
					subscription = undefined;
				}
			});

			setTimeout(() => {
				if (subscription) {
					reject(new Error('Debug session failed to start within 5 seconds'));
					subscription.dispose();
					subscription = undefined;
				}
			}, 5000);
		});

		const started = await vscode.debug.startDebugging(this.workspaceFolder, debuggerConfig);
		if (started) {
			return await debugSessionPromise;
		} else {
			throw new Error('Debug session couldn\'t be started');
		}
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

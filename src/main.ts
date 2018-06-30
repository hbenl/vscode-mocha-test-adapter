import * as vscode from 'vscode';
import { TestExplorerExtension, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { MochaAdapter } from './adapter';
import { Log } from 'vscode-test-adapter-util';

export async function activate(context: vscode.ExtensionContext) {

	const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];
	const log = new Log('mochaExplorer', workspaceFolder, 'Mocha Explorer Log');

	const testExplorerExtension = vscode.extensions.getExtension<TestExplorerExtension>(testExplorerExtensionId);
	if (log.enabled) log.info(`Test Explorer ${testExplorerExtension ? '' : 'not '}found`);

	if (testExplorerExtension) {

		if (!testExplorerExtension.isActive) {
			log.warn('Test Explorer is not active - trying to activate');
			await testExplorerExtension.activate();
		}

		context.subscriptions.push(new TestAdapterRegistrar(testExplorerExtension.exports, log));
	}
}

class TestAdapterRegistrar {

	private readonly registeredAdapters = new Map<vscode.WorkspaceFolder, MochaAdapter>();

	constructor(
		private readonly testExplorer: TestExplorerExtension,
		private readonly log: Log
	) {

		if (vscode.workspace.workspaceFolders) {
			for (const workspaceFolder of vscode.workspace.workspaceFolders) {
				this.add(workspaceFolder);
			}
		}

		log.info('Initialization finished');

		vscode.workspace.onDidChangeWorkspaceFolders((event) => {

			for (const workspaceFolder of event.removed) {
				this.remove(workspaceFolder);
			}

			for (const workspaceFolder of event.added) {
				this.add(workspaceFolder);
			}
		});
	}

	add(workspaceFolder: vscode.WorkspaceFolder) {

		if (this.log.enabled) this.log.info(`Creating adapter for ${workspaceFolder.uri.fsPath}`);

		const adapter = new MochaAdapter(workspaceFolder, this.log);
		this.registeredAdapters.set(workspaceFolder, adapter);

		if (this.log.enabled) this.log.info(`Registering adapter for ${workspaceFolder.uri.fsPath}`);

		this.testExplorer.registerAdapter(adapter);
	}

	remove(workspaceFolder: vscode.WorkspaceFolder) {

		const adapter = this.registeredAdapters.get(workspaceFolder);
		if (adapter) {

			if (this.log.enabled) this.log.info(`Removing adapter for ${workspaceFolder.uri.fsPath}`);

			this.testExplorer.unregisterAdapter(adapter);
			this.registeredAdapters.delete(workspaceFolder);
			adapter.dispose();
		}
	}

	dispose(): void {
		for (const workspaceFolder of this.registeredAdapters.keys()) {
			this.remove(workspaceFolder);
		}
		this.log.dispose();
	}
}

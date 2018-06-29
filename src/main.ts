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

		const registeredAdapters = new Map<vscode.WorkspaceFolder, MochaAdapter>();

		if (vscode.workspace.workspaceFolders) {
			for (const workspaceFolder of vscode.workspace.workspaceFolders) {
				if (log.enabled) log.info(`Creating adapter for ${workspaceFolder.uri.fsPath}`);
				const adapter = new MochaAdapter(workspaceFolder, log);
				registeredAdapters.set(workspaceFolder, adapter);
				if (log.enabled) log.info(`Registering adapter for ${workspaceFolder.uri.fsPath}`);
				testExplorerExtension.exports.registerAdapter(adapter);
			}
		}

		log.info('Initialization finished');

		vscode.workspace.onDidChangeWorkspaceFolders((event) => {

			for (const workspaceFolder of event.removed) {
				const adapter = registeredAdapters.get(workspaceFolder);
				if (adapter) {
					if (log.enabled) log.info(`Removing adapter for ${workspaceFolder.uri.fsPath}`);
					testExplorerExtension.exports.unregisterAdapter(adapter);
					registeredAdapters.delete(workspaceFolder);
				}
			}

			for (const workspaceFolder of event.added) {
				if (log.enabled) log.info(`Creating adapter for ${workspaceFolder.uri.fsPath}`);
				const adapter = new MochaAdapter(workspaceFolder, log);
				registeredAdapters.set(workspaceFolder, adapter);
				if (log.enabled) log.info(`Registering adapter for ${workspaceFolder.uri.fsPath}`);
				testExplorerExtension.exports.registerAdapter(adapter);
			}
		});
	}
}

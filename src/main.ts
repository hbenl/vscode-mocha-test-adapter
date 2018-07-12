import * as vscode from 'vscode';
import { TestExplorerExtension, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { MochaAdapter } from './adapter';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';

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

		context.subscriptions.push(new TestAdapterRegistrar(
			testExplorerExtension.exports,
			(workspaceFolder) => new MochaAdapter(workspaceFolder, log),
			log
		));
	}
}

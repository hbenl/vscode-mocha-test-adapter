import * as vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { MochaAdapter } from './adapter';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';

export async function activate(context: vscode.ExtensionContext) {

	const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];
	const outputChannel = vscode.window.createOutputChannel('Mocha Tests');
	const log = new Log('mochaExplorer', workspaceFolder, 'Mocha Explorer Log');

	const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
	if (log.enabled) log.info(`Test Explorer ${testExplorerExtension ? '' : 'not '}found`);

	if (testExplorerExtension) {

		const testHub = testExplorerExtension.exports;

		context.subscriptions.push(new TestAdapterRegistrar(
			testHub,
			(workspaceFolder) => new MochaAdapter(workspaceFolder, outputChannel, log),
			log
		));
	}
}

import * as vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { configSection } from './configKeys';
import { MochaAdapter } from './adapter';

export async function activate(context: vscode.ExtensionContext) {

	const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];
	const outputChannel = vscode.window.createOutputChannel('Mocha Tests');
	const log = new Log(configSection, workspaceFolder, 'Mocha Explorer Log');

	const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
	if (log.enabled) log.info(`Test Explorer ${testExplorerExtension ? '' : 'not '}found`);

	if (testExplorerExtension) {

		const testHub = testExplorerExtension.exports;

		const registrar = new TestAdapterRegistrar(
			testHub,
			(workspaceFolder) => new MochaAdapter(workspaceFolder, context.workspaceState, outputChannel, log),
			log
		);
		context.subscriptions.push(registrar);

		context.subscriptions.push(
			vscode.commands.registerCommand('mochaExplorer.enable', () => enableAdapter(registrar))
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('mochaExplorer.disable', () => disableAdapter(registrar))
		);
	}
}

async function enableAdapter(
	registrar: TestAdapterRegistrar<MochaAdapter>
): Promise<void> {

	const workspaceFolder = await chooseWorkspaceFolder('Select the workspace folder for which you want to enable Mocha Test Explorer');
	if (workspaceFolder) {
		const adapter = registrar.getAdapter(workspaceFolder);
		if (adapter) {
			adapter.enable();
		}
	}
}

async function disableAdapter(
	registrar: TestAdapterRegistrar<MochaAdapter>
): Promise<void> {

	const workspaceFolder = await chooseWorkspaceFolder('Select the workspace folder for which you want to disable Mocha Test Explorer');
	if (workspaceFolder) {
		const adapter = registrar.getAdapter(workspaceFolder);
		if (adapter) {
			adapter.disable();
		}
	}
}

async function chooseWorkspaceFolder(msg: string): Promise<vscode.WorkspaceFolder | undefined> {

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders && workspaceFolders.length > 0) {

		if (workspaceFolders.length === 1) {

			return workspaceFolders[0];

		} else {

			const workspaceFolderName = await vscode.window.showQuickPick(
				workspaceFolders.map(wsf => wsf.name),
				{ placeHolder: msg }
			);
			return workspaceFolders.find(wsf => (wsf.name === workspaceFolderName));

		}
	} else {
		return undefined;
	}
}

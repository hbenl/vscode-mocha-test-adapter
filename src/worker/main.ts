import { createClient } from "../ipc/client";
import { loadTests } from './loadTests';
import { WorkerArgs } from '../util';
import { runTests } from './runTests';
import { createServer, MinimalLog } from '../ipc/server';
import * as resolve from 'resolve';
import { WorkerPlugin } from './plugin';
import * as nodeRequire from 'nodeRequire';

// Default, noop plugin when user does not specify a plugin
const noopPlugin: WorkerPlugin = {
	convertAbsoluteLocalPathToRemote(p) {return p},
	convertAbsoluteRemotePathToLocal(p) {return p},
	convertRelativeLocalPathToRemote(p) {return p},
	convertRelativeRemotePathToLocal(p) {return p},
};

async function main() {
	const workerArgs = <WorkerArgs>JSON.parse(process.argv[2]);
	const {ipcPort, ipcWorkerRole, action, pluginPath} = workerArgs;

	const log: MinimalLog = {
		info(...args: any[]) { console.log(...args); }
	};

	const cwd = process.cwd();
	const plugin = pluginPath == null ? noopPlugin : require(resolve.sync(pluginPath, {
		basedir: cwd,
		// Always respect require hooks as soon as they are loaded (possibly installed by the preceding require call)
		extensions: Object.keys(nodeRequire.extensions)
	})) as WorkerPlugin;

	if (ipcPort) {
		const ipcEndpoint = ipcWorkerRole === 'client'
			? await createClient(ipcPort, () => {}, log)
			: await (await createServer(ipcPort, () => {}, log)).connection;
		const sendMessage = (message: any) => ipcEndpoint.sendMessage(message);
		doWorkerAction(sendMessage);
	} else {
		const sendMessage = process.send ? (message: any) => process.send!(message) : console.log;
		sendMessage('hello from the worker process');
		doWorkerAction(sendMessage);
	}

	function convertArgs(workerArgs: WorkerArgs): WorkerArgs {
		return {
			...workerArgs,
			testFiles: workerArgs.testFiles.map(f => plugin.convertAbsoluteLocalPathToRemote(f))
		};
	}

	function doWorkerAction(sendMessage: (message: any) => void) {
		const convertedArgs = convertArgs(workerArgs);
		({loadTests, runTests})[action]({...convertedArgs, plugin}, sendMessage);
	}

}

main();

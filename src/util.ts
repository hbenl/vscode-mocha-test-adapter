import * as fs from 'fs';
import * as util from 'util';
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { WorkerArgs } from 'vscode-test-adapter-remoting-util/out/mocha';
import { WorkerArgsAugmented } from './interfaces';

export function fileExists(path: string): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		fs.access(path, err => resolve(!err));
	});
}

export function readFile(path: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		fs.readFile(path, 'utf8', (err, data) => {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		})
	});
}

export function* findTests(
	info: TestInfo | TestSuiteInfo,
	filter: {
		tests: (info: TestInfo) => boolean,
		suites?: (info: TestSuiteInfo) => boolean
	}
): IterableIterator<TestInfo> {

	if (info.type === 'suite') {

		if (!filter.suites || filter.suites(info)) {
			for (const child of info.children) {
				yield* findTests(child, filter);
			}
		}

	} else {

		if (!filter.tests || filter.tests(info)) {
			yield info;
		}

	}
}

export function collectFiles(root: TestInfo | TestSuiteInfo, test?: (item: TestInfo | TestSuiteInfo) => boolean): Set<string> {
	const files = new Set<string>();
	function collect(info: TestInfo | TestSuiteInfo) {
		if (test && !test(info)) {
			return;
		}
		if (info.file) {
			files.add(info.file);
			return;
		}
		if (info.type !== 'suite') {
			return;
		}

		for (const child of info.children) {
			collect(child);
		}
	}

	collect(root);
	return files;
}

export function stringsOnly(env: { [envVar: string]: string | null | undefined }): { [envVar: string]: string } {
	const result: { [envVar: string]: string } = {};
	for (const envVar in env) {
		const val = env[envVar];
		if (typeof val === 'string') {
			result[envVar] = val;
		}
	}
	return result;
}

/**
 * A simple deep compararison
 * (only handles primitives except no dates - i.e. JSON objects)
 */
export function deepEqual<T>(a: T, b: T, depth = 10) {
    if (depth < 0) {
        console.error('Comparing too deep entities');
        return false;
	}

    if (a == b) {  // simple equality is intended
        return true;
	}

    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i], depth - 1))
                return false;
        }
        return true;
	}

    // handle plain objects
    const t = typeof a;
    if (t !== 'object' || t !== typeof b)
        return false;
    let ak = Object.keys(a);
	let bk = Object.keys(b);
    if (ak.length !== bk.length)
        return false;
    for (const k of Object.keys(a)) {
        if (!(k in b) || !deepEqual((a as any)[k], (b as any)[k], depth - 1))
            return false;
    }
    return true;
}

export function areCompatibleRunners(a: WorkerArgs, b: WorkerArgs): boolean {
	return deepEqual(extractInit(a), extractInit(b), 10);
}

export function extractInit(x: WorkerArgsAugmented) {
	return {
		mochaOpts: x.mochaOpts,
		cwd: x.cwd,
		env: x.env,
		enableHmr: x.enableHmr,
		mochaPath: x.mochaPath,
		testFiles: x.testFiles,
		skipFrames: x.skipFrames,
	}
}

export function workerFailureMessage(err: any, port?: any) {
	return `Worker finished with code (${util.inspect(err)}).

This usually happens in one of those situations:
	- The port on which the worker listens is already being used.
		⛔ You may have several instances of vscode using mocha-hmr configured to use the same port (port ${port || '<unkown. check your config>'}).
		👉 To fix that, you can change the port via adding "mochaExplorer.debuggerPort" in your .vscode/settings.json config file (and use a random port)

	- There is an infinite loop or a memory leak in your code, that allocates memory, and your worker crashed out-of-memory
		👉 If it crashed after a long time of normal behaviour, just reload your tests.
		👉 Else, this is a hard one. Try to attach a debugger to your worker (port ${port || '<unkown. check your config>'}) before it crashes to understand what's going on.

	- There is a syntax error in your compiled code
		👉 Check for build errors, then reload.

Alternatively, you can file an issue: https://github.com/oguimbal/vscode-mocha-test-adapter/issues
	`;
}
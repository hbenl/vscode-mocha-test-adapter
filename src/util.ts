import * as fs from 'fs';
import { MochaOpts } from './opts';
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';
import { EnvVars } from './configReader';

export interface WorkerArgs {
	action: 'loadTests' | 'runTests';
	testFiles: string[];
	tests?: string[];
	env: EnvVars;
	mochaPath: string;
	mochaOpts: MochaOpts;
	monkeyPatch?: boolean;
	logEnabled: boolean;
	workerScript?: string;
	debuggerPort?: number;
}

export interface NetworkOptions {
	role: 'client' | 'server';
	port: number;
	host?: string;
}

export interface ErrorInfo {
	type: 'error';
	errorMessage: string;
}

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

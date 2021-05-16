import * as fs from 'fs';
import url from 'url';
import path from 'path';
import { TestInfo, TestSuiteInfo } from 'vscode-test-adapter-api';

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

export function normalizePathOrFileUrlToPath(p: string): string {
	if (p?.startsWith("file://")) {
		p = url.fileURLToPath(p);
	}
	return normalizePath(p);
}

export function normalizePath(p: string): string {
	if (!p) {
		return p;
	}
	if (process.platform === 'win32') {
		// On Windows, normalize drive letter to upper case. Works around
		// https://github.com/microsoft/vscode/issues/68325. A mismatch in
		// the drive letter case can cause node to load the same module
		// twice. 
		const match = /^([a-z]):/.exec(p);
		if (match) {
			p = match[1].toUpperCase() + p.substr(1);
		}
	}
	return path.normalize(p);
}


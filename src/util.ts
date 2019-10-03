import * as fs from 'fs';
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

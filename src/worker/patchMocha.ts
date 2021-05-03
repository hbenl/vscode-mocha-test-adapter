import path from 'path';
import os from 'os';
import stackTrace from 'stack-trace';
import url from 'url';
import { normalizePath, normalizePathOrFileUrlToPath } from '../util';

export interface Location {
	file: string;
	line: number
}

export function patchMocha(
	Mocha: typeof import('mocha'),
	ui: string,
	locationSymbol: symbol,
	baseDir: string | undefined,
	log?: (message: any) => void
): void {

	if (ui === 'bdd') {

		Mocha.interfaces.bdd = patchInterface(
			Mocha.interfaces.bdd,
			[ 'describe', 'it', 'context', 'specify' ],
			locationSymbol,
			baseDir,
			log
		);

	} else if (ui === 'tdd') {

		Mocha.interfaces.tdd = patchInterface(
			Mocha.interfaces.tdd,
			[ 'suite', 'test' ],
			locationSymbol,
			baseDir,
			log
		);

	} else if (ui === 'qunit') {

		Mocha.interfaces.qunit = patchInterface(
			Mocha.interfaces.qunit,
			[ 'suite', 'test' ],
			locationSymbol,
			baseDir,
			log
		);
	}
}

type MochaInterface = (suite: Mocha.Suite) => void;

function patchInterface(
	origInterface: MochaInterface,
	functionNames: string[],
	locationSymbol: symbol,
	baseDir: string | undefined,
	log?: (message: any) => void
): MochaInterface {
	return (suite: Mocha.Suite) => {

		origInterface(suite);

		suite.on('pre-require', (context: any, file) => {
			for (const functionName of functionNames) {

				if (log) log(`Patching ${functionName}`);
				const origFunction = context[functionName];
				const patchedFunction = patchFunction(origFunction, file, locationSymbol, baseDir, log);

				for (const property in origFunction) {
					if ((property === 'skip') || (property === 'only')) {

						if (log) log(`Patching ${functionName}.${property}`);
						patchedFunction[property] = patchFunction(origFunction[property], file, locationSymbol, baseDir, log);

					} else {

						if (log) log(`Copying ${functionName}.${property}`);
						patchedFunction[property] = origFunction[property];
					}
				}

				context[functionName] = patchedFunction;
			}
		});
	}
}

function patchFunction(
	origFunction: Function,
	file: string,
	locationSymbol: symbol,
	baseDir: string | undefined,
	log?: (message: any) => void
): any {
	return function(this: any) {

		const result = origFunction.apply(this, arguments);

		if (result) {
			const location = findCallLocation(file, baseDir, log);
			if (location !== undefined) {
				result[locationSymbol] = location;
			}
		}

		return result;
	}
}

function findCallLocation(
	runningFile: string,
	baseDir: string | undefined,
	log?: (message: any) => void
): Location | undefined {

	const err = new Error();
	const stackFrames = stackTrace.parse(err);

	if (!baseDir) {

		if (log) log(`Looking for ${runningFile} in ${err.stack}`);

		for (var i = 0; i < stackFrames.length - 1; i++) {
			const stackFrame = stackFrames[i];
			let filename = stackFrame.getFileName();
			if (typeof filename === 'string') {
				filename = normalizePathOrFileUrlToPath(filename);
				if (filename === runningFile) {
					return { file: runningFile, line: stackFrame.getLineNumber() - 1 };
				}
			}
		}

	} else {

		if (log) log(`Looking for ${baseDir} in ${err.stack}`);

		if (baseDir) {
			for (var i = 0; i < stackFrames.length - 1; i++) {
				const stackFrame = stackFrames[i];
				const file = normalizePathOrFileUrlToPath(stackFrame.getFileName());
				if (file.startsWith(baseDir)) {
					return { file, line: stackFrame.getLineNumber() - 1 };
				}
			}
		}
	}

	return undefined;
}

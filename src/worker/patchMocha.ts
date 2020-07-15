import {parseStackTrace} from './stack-trace';
import path from 'path';
import { IQueueWriter } from './commandQueue';
import { writer } from 'repl';
import * as util from 'util';

export const locationSymbol = Symbol('location');
export const reRegisterSymbol = Symbol('re-register');

export interface Location {
	file: string;
	line: number
}

export function patchMocha(
	Mocha: typeof import('mocha'),
	ui: string,
	baseDir: string | undefined,
	skipFrames: string[] | undefined,
	log: IQueueWriter
): void {
	baseDir = normalizeFileName(baseDir);
	if (skipFrames && baseDir) {
		skipFrames = skipFrames
			.map(x => path.resolve(baseDir!, x))
			.map(x => normalizeFileName(x));
	} else {
		skipFrames = undefined;
	}

	if (ui === 'bdd') {

		Mocha.interfaces.bdd = patchInterface(
			Mocha.interfaces.bdd,
			[ 'describe', 'it', 'context', 'specify' ],
			skipFrames,
			baseDir,
			log
		);

	} else if (ui === 'tdd') {

		Mocha.interfaces.tdd = patchInterface(
			Mocha.interfaces.tdd,
			[ 'suite', 'test' ],
			skipFrames,
			baseDir,
			log
		);

	} else if (ui === 'qunit') {

		Mocha.interfaces.qunit = patchInterface(
			Mocha.interfaces.qunit,
			[ 'suite', 'test' ],
			skipFrames,
			baseDir,
			log
		);
	}
}

type MochaInterface = (suite: Mocha.Suite) => void;

function patchInterface(
	origInterface: MochaInterface,
	functionNames: string[],
	skipFrames: string[] | undefined,
	baseDir: string | undefined,
	log: IQueueWriter
): MochaInterface {
	return (suite: Mocha.Suite) => {

		origInterface(suite);

		suite.on('pre-require', (context: any, file) => {
			for (const functionName of functionNames) {

				log.sendDebug(`Patching ${functionName}`);
				const origFunction = context[functionName];
				file = normalizeFileName(file);
				const patchedFunction = patchFunction(origFunction, file, skipFrames, baseDir, log);

				for (const property in origFunction) {
					if ((property === 'skip') || (property === 'only')) {

						log.sendDebug(`Patching ${functionName}.${property}`);
						patchedFunction[property] = patchFunction(origFunction[property], file, skipFrames, baseDir, log);

					} else {

						log.sendDebug(`Copying ${functionName}.${property}`);
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
	skipFrames: string[] | undefined,
	baseDir: string | undefined,
	log: IQueueWriter
): any {
	return function(this: any, ...args: any[]) {

		let location: any;
		const register = () => {
			location = location || findCallLocation(file, baseDir, skipFrames, log);
			const suiteName = typeof args[0] === 'string' ? args[0] : '<unkonwn test suite>';
			let result;
			try {
				// register this suite
				result = origFunction.apply(this, args);
			} catch (e) {
				// log.sendError
				log.sendError(`The suite initialization "${suiteName}" has failed.
This usually happens when something threw an exception in the describe() function.
Please follow this best practice, then reload your tests:

	describe('some name', () => {

		// <== ⛔ NO CODE HERE... only in hook functions (it, beforeEach, ...)

		it ('does something, () => {
			// <== ✅ code here
		})
	})

======== THROWN ERROR ========

				 ${util.inspect(e)}`)
			}
			if (!result) {
				return result;
			}
			if (location !== undefined) {
				result[locationSymbol] = location;
			}
			result[reRegisterSymbol] = register;
			return result;
		}

		return register();
	}
}

const originalSource = Symbol('original_source');
export function hookStack() {
	const originalPrepare: any = Error.prepareStackTrace;
	if (!originalPrepare) {
		return function(){};
	}
	Error.prepareStackTrace = function(this: any, error: any, stack: any[]) {
		// retreive orignal file names (non source mapped)
		// and set them on error object
		// but do not modify the stack
		const sources = stack.map(f => f.isNative()
				? '<native>'
				:  (f.getFileName() || f.getScriptNameOrSourceURL()));
		error[originalSource] = sources;
		const ret = originalPrepare.apply(this, arguments);
		return ret;
	};
	return () => Error.prepareStackTrace = originalPrepare;
}


function findCallLocation(
	runningFile: string,
	baseDir: string | undefined,
	skipFrames: string[] | undefined,
	log: IQueueWriter
): Location | undefined {

	const dispose = hookStack();
	const err = new Error();
	const stackFrames = parseStackTrace(err);
	const originalFiles = (err as any)[originalSource];
	dispose();

	if (!baseDir) {

		log.sendDebug(`Looking for ${runningFile} in ${err.stack}`);

		for (var i = 0; i < stackFrames.length - 1; i++) {
			const stackFrame = stackFrames[i];
			let file = normalizeFileName(stackFrame.fileName!);
			if (file === runningFile) {
				return { file: runningFile, line: stackFrame.lineNumber! - 1 };
			}
		}

	} else {

		log.sendDebug(`Looking for ${baseDir} in ${err.stack}`);

		if (baseDir) {
			for (var i = 0; i < stackFrames.length - 1; i++) {
				const stackFrame = stackFrames[i];
				// const originalFile = originalFiles[i];
				// console.log(originalFile);
				let file = normalizeFileName(stackFrame.fileName!);
				if (!file) {
					continue;
				}
				if (file && file.startsWith(baseDir)) {
					if((skipFrames || []).find(x => file.startsWith(x))) {
						continue;
					}
					return { file, line: stackFrame.lineNumber! - 1 };
				}
			}
		}
	}

	return undefined;
}

function normalizeFileName(file: string | undefined): string {
	if (!file) {
		return file as string;
	}
	return file.replace(/\\/g, '/').toLowerCase();
}
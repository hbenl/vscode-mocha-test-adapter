	import stackTrace, { StackFrame } from 'stack-trace';
import path from 'path';

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
	log?: (message: any) => void
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
	log?: (message: any) => void
): MochaInterface {
	return (suite: Mocha.Suite) => {

		origInterface(suite);

		suite.on('pre-require', (context: any, file) => {
			for (const functionName of functionNames) {

				if (log) log(`Patching ${functionName}`);
				const origFunction = context[functionName];
				file = normalizeFileName(file);
				const patchedFunction = patchFunction(origFunction, file, skipFrames, baseDir, log);

				for (const property in origFunction) {
					if ((property === 'skip') || (property === 'only')) {

						if (log) log(`Patching ${functionName}.${property}`);
						patchedFunction[property] = patchFunction(origFunction[property], file, skipFrames, baseDir, log);

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
	skipFrames: string[] | undefined,
	baseDir: string | undefined,
	log?: (message: any) => void
): any {
	return function(this: any, ...args: any[]) {

		let location: any;
		const register = () => {
			const result = origFunction.apply(this, args);
			if (!result) {
				return result;
			}
			location = location || findCallLocation(file, baseDir, skipFrames, log);
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

/**
 * Webpack eval source maps are producing (who knows why) stacks like:
 * webpack-internal://./path/to/my/file.ts
 * This function patches it by replacing those with actual paths.
 */
export function patchWebpackInternals(cwd: string) {
	const basePath = path.resolve(cwd).replace(/\\/g, '/');
	const originalPrepare: any = Error.prepareStackTrace;
	Error.prepareStackTrace = function(this: any, error: any, stack: any[]) {
		error.stack = error.stack.replace(/webpack\-internal:\/\/\/\./g, basePath);
		if (originalPrepare) {
			const ret = originalPrepare.apply(this, arguments);
			return ret;
		}
	};

}

function findCallLocation(
	runningFile: string,
	baseDir: string | undefined,
	skipFrames: string[] | undefined,
	log?: (message: any) => void
): Location | undefined {

	const dispose = hookStack();
	const err = new Error();
	const stackFrames = stackTrace.parse(err);
	const originalFiles = (err as any)[originalSource];
	dispose();

	if (!baseDir) {

		if (log) log(`Looking for ${runningFile} in ${err.stack}`);

		for (var i = 0; i < stackFrames.length - 1; i++) {
			const stackFrame = stackFrames[i];
			let file = normalizeFileName(stackFrame.getFileName());
			if (file === runningFile) {
				return { file: runningFile, line: stackFrame.getLineNumber() - 1 };
			}
		}

	} else {

		if (log) log(`Looking for ${baseDir} in ${err.stack}`);

		if (baseDir) {
			for (var i = 0; i < stackFrames.length - 1; i++) {
				const stackFrame = stackFrames[i];
				// const originalFile = originalFiles[i];
				// console.log(originalFile);
				let file = normalizeFileName(stackFrame.getFileName());
				if (!file) {
					continue;
				}
				if (file && file.startsWith(baseDir)) {
					if((skipFrames || []).find(x => file.startsWith(x))) {
						continue;
					}
					return { file, line: stackFrame.getLineNumber() - 1 };
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
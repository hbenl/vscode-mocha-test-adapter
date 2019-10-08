import stackTrace from 'stack-trace';
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

function findCallLocation(
	runningFile: string,
	baseDir: string | undefined,
	skipFrames: string[] | undefined,
	log?: (message: any) => void
): Location | undefined {

	const err = new Error();
	const stackFrames = stackTrace.parse(err);

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
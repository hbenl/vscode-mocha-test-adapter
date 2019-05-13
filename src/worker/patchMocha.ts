import { parse as parseStackTrace } from 'stack-trace';

export function patchMocha(Mocha: typeof import('mocha'), ui: string, lineSymbol: symbol, log?: (message: any) => void) {

	if (ui === 'bdd') {

		Mocha.interfaces.bdd = patchInterface(
			Mocha.interfaces.bdd,
			['describe', 'it', 'context', 'specify'],
			lineSymbol,
			log
		);

	} else if (ui === 'tdd') {

		Mocha.interfaces.tdd = patchInterface(
			Mocha.interfaces.tdd,
			['suite', 'test'],
			lineSymbol,
			log
		);

	} else if (ui === 'qunit') {

		Mocha.interfaces.qunit = patchInterface(
			Mocha.interfaces.qunit,
			['suite', 'test'],
			lineSymbol,
			log
		);
	}
}

type MochaInterface = (suite: Mocha.Suite) => void;

function patchInterface(
	origInterface: MochaInterface,
	functionNames: string[],
	lineSymbol: symbol,
	log?: (message: any) => void
): MochaInterface {
	return (suite: Mocha.Suite) => {

		origInterface(suite);

		suite.on('pre-require', (context: any, file, mocha) => {
			for (const functionName of functionNames) {

				if (log) log(`Patching ${functionName}`);
				const origFunction = context[functionName];
				const patchedFunction = patchFunction(origFunction, file, lineSymbol, log);

				for (const property in origFunction) {
					if ((property === 'skip') || (property === 'only')) {

						if (log) log(`Patching ${functionName}.${property}`);
						patchedFunction[property] = patchFunction(origFunction[property], file, lineSymbol, log);

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
	lineSymbol: symbol,
	log?: (message: any) => void
): any {
	return function (this: any) {

		const result = origFunction.apply(this, arguments);

		if (result) {
			const line = findCallLocation(file, log);
			if (line !== undefined) {
				result[lineSymbol] = line;
			}
		}

		return result;
	}
}

function findCallLocation(
	file: string,
	log?: (message: any) => void
): number | undefined {

	const err = new Error();
	if (log) log({ type: "error", errorMessage: `Looking for ${file} in ${err.stack}` });
	const stackTrace = parseStackTrace(err);
	for (var i = 0; i < stackTrace.length - 1; i++) {
		const stackFrame = stackTrace[i];
		if (stackFrame.getFileName() === file) {
			return stackFrame.getLineNumber() - 1;
		}
	}

	return undefined;
}

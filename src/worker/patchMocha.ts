import * as Mocha from 'mocha';
import { parse as parseStackTrace } from 'stack-trace';

export function patchMocha(ui: string, lineSymbol: symbol) {

	if (ui === 'bdd') {

		Mocha.interfaces.bdd = patchInterface(
			Mocha.interfaces.bdd,
			[ 'describe', 'it', 'context', 'specify' ],
			lineSymbol
		);

	} else if (ui === 'tdd') {

		Mocha.interfaces.tdd = patchInterface(
			Mocha.interfaces.tdd,
			[ 'suite', 'test' ],
			lineSymbol
		);

	} else if (ui === 'qunit') {

		Mocha.interfaces.qunit = patchInterface(
			Mocha.interfaces.qunit,
			[ 'suite', 'test' ],
			lineSymbol
		);
	}
}

type MochaInterface = (suite: Mocha.Suite) => void;

function patchInterface(
	origInterface: MochaInterface,
	functionNames: string[],
	lineSymbol: symbol
): MochaInterface {
	return (suite: Mocha.Suite) => {

		origInterface(suite);

		suite.on('pre-require', (context: any, file, mocha) => {
			for (const functionName of functionNames) {

				const origFunction = context[functionName];
				const patchedFunction = patchFunction(origFunction, file, lineSymbol);

				for (const property in origFunction) {
					if ((property === 'skip') || (property === 'only')) {
						patchedFunction[property] = patchFunction(origFunction[property], file, lineSymbol);
					} else {
						patchedFunction[property] = origFunction[property];
					}
				}

				context[functionName] = patchedFunction;
			}
		});
	}
}

function patchFunction(origFunction: Function, file: string, lineSymbol: symbol): any {
	return function(this: any) {

		const result = origFunction.apply(this, arguments);

		const line = findCallLocation(file);
		if (line !== undefined) {
			result[lineSymbol] = line;
		}

		return result;
	}
}

function findCallLocation(file: string): number | undefined {

	const stackTrace = parseStackTrace(new Error());

	for (var i = 0; i < stackTrace.length - 1; i++) {
		const stackFrame = stackTrace[i];
		if (stackFrame.getFileName() === file) {
			return stackFrame.getLineNumber() - 1;
		}
	}

	return undefined;
}

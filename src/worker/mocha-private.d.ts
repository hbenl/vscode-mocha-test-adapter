declare namespace Mocha {
	namespace utils {
		function lookupFiles(path: string, extensions: string[], recursive?: boolean): string[];
	}
	interface ISuite {
		file?: string;
		suites: ISuite[];
		tests: ITest[];
		retries(n?: number | string): ISuite | number;
	}
	interface ITest {
		file?: string;
	}
	interface IRunner {
		on(event: string, listener: Function): this;
	}
}

declare interface Mocha {
	suite: Mocha.ISuite;
}

declare module "mocha/lib/utils" {
	function stringify(value: any): string;
}

declare module "mocha/lib/cli/options" {
	function loadOptions(argv?: string | string[]): {};
}

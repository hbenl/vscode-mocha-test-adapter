declare namespace Mocha {
	namespace utils {
		function lookupFiles(path: string, extensions: string[], recursive?: boolean): string[];
	}
	interface ISuite {
		file?: string;
		title: string;
		fullTitle(): string;
		suites: ISuite[];
		tests: ITest[];
		retries(n?: number | string): ISuite | number;
	}
	interface ITest {
		file?: string;
		title: string;
		fullTitle(): string;
		pending?: boolean;
	}
	interface IRunner {
		on(event: string, listener: Function): this;
	}
}

declare interface Mocha {
	suite: Mocha.Suite;
}

declare module "mocha/lib/utils" {
	function stringify(value: any): string;
}

declare module "mocha/lib/esm-utils" {
	function requireOrImport(file: string): Promise<any>;
}

declare module "mocha/lib/cli/options" {
	function loadOptions(argv?: string | string[]): {};
}

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

declare interface PrivateMocha extends Mocha {
	suite: Mocha.ISuite;
    loadFiles(fn?: () => void): void;
}

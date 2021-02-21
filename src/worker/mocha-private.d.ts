declare namespace Mocha {
	interface Runner {
		on(event: "fail", listener: (test: Test | Hook, err: Error & { actual?: any, expected?: any, showDiff?: boolean }) => void): this;
	}
}

declare module "mocha/lib/cli/options" {
	function loadOptions(argv?: string | string[]): {};
}

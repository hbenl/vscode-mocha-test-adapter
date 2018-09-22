export interface MochaOpts {
	mochaPath: string,
	ui: string,
	timeout: number,
	retries: number,
	requires: string[],
	exit: boolean
}

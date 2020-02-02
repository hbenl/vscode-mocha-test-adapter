
export function buildTestId(suite: Mocha.ISuite | Mocha.IHook | Mocha.ITest): string {
	if ('type' in suite && suite.type === 'hook') {
		const ctx = suite.ctx as any;
		if (ctx && ctx.currentTest) {
			suite = ctx.currentTest as Mocha.ITest;
		} else {
			debugger;
			return '';
		}
	}
	return `${suite.file}: ${suite.fullTitle()}`;
}

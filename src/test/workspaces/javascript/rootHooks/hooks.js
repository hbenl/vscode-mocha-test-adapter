exports.mochaHooks = {
	beforeAll() {
		global.valueDefinedByHook = 42;
	}
};

export type OnChange = 'reloadConfig' | 'retire' | 'reloadTests';

export interface ConfigKeyInfo {
	key: string;
	fullKey: string;
	onChange?: OnChange;
}

export const configSection = 'mochaExplorer';

const rawConfigKeys: { [key: string]: { onChange?: OnChange } } = {
	files: { onChange: 'reloadTests' },
	ignore: { onChange: 'reloadTests' },
	pruneFiles: { onChange: 'retire' },
	env: { onChange: 'reloadTests' },
	envPath: { onChange: 'reloadTests' },
	cwd: { onChange: 'reloadTests' },
	ui: { onChange: 'reloadTests' },
	timeout: { onChange: 'retire' },
	retries: { onChange: 'retire' },
	require: { onChange: 'reloadTests' },
	fullTrace: { onChange: 'reloadConfig' },
	delay: { onChange: 'reloadTests' },
	exit: { onChange: 'reloadConfig' },
	asyncOnly: { onChange: 'retire' },
	parallel: {},
	jobs: {},
	configFile: { onChange: 'reloadTests' },
	pkgFile: { onChange: 'reloadTests' },
	optsFile: { onChange: 'reloadTests' },
	nodePath: { onChange: 'reloadTests' },
	nodeArgv: { onChange: 'reloadTests' },
	mochaPath: { onChange: 'reloadTests' },
	monkeyPatch: { onChange: 'reloadTests' },
	multiFileSuites: { onChange: 'reloadTests' },
	debuggerPort: { onChange: 'reloadConfig' },
	debuggerConfig: { onChange: 'reloadConfig' },
	esmLoader: { onChange: 'reloadTests' },
	globImplementation: { onChange: 'reloadTests' },
	launcherScript: { onChange: 'reloadTests' },
	ipcRole: { onChange: 'reloadTests' },
	ipcPort: { onChange: 'reloadTests' },
	ipcHost: { onChange: 'reloadTests' },
	ipcTimeout: { onChange: 'reloadTests' },
	autoload: { onChange: 'reloadConfig' },
	logpanel: {},
	logfile: {},
};

export const configKeys: { [key: string]: ConfigKeyInfo } = {};
for (const key in rawConfigKeys) {
	configKeys[key] = { key, fullKey: `${configSection}.${key}`, onChange: rawConfigKeys[key].onChange };
}

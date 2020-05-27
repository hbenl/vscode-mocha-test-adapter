export type OnChange = 'reloadConfig' | 'retire' | 'reloadTests';

export interface ConfigKeyInfo {
	key: string;
	fullKey: string;
	onChange?: OnChange;
}

export const configSection = 'mochaExplorer';

const rawConfigKeys: { [key: string]: { onChange?: OnChange } } = {
	files: { onChange: 'reloadTests' },
	pruneFiles: { onChange: 'retire' },
	env: { onChange: 'reloadTests' },
	envPath: { onChange: 'reloadTests' },
	cwd: { onChange: 'reloadTests' },
	ui: { onChange: 'reloadTests' },
	timeout: { onChange: 'retire' },
	retries: { onChange: 'retire' },
	require: { onChange: 'reloadTests' },
	fullTrace: { onChange: 'reloadConfig' },
	exit: { onChange: 'reloadConfig' },
	optsFile: { onChange: 'reloadTests' },
	nodePath: { onChange: 'reloadTests' },
	mochaPath: { onChange: 'reloadTests' },
	monkeyPatch: { onChange: 'reloadTests' },
	debuggerPort: { onChange: 'reloadConfig' },
	debuggerConfig: { onChange: 'reloadConfig' },
	esmLoader: { onChange: 'reloadTests' },
	launcherScript: { onChange: 'reloadTests' },
	ipcRole: { onChange: 'reloadTests' },
	ipcPort: { onChange: 'reloadTests' },
	ipcHost: { onChange: 'reloadTests' },
	autoload: { onChange: 'reloadConfig' },
	logpanel: {},
	logfile: {},
};

export const configKeys: { [key: string]: ConfigKeyInfo } = {};
for (const key in rawConfigKeys) {
	configKeys[key] = { key, fullKey: `${configSection}.${key}`, onChange: rawConfigKeys[key].onChange };
}

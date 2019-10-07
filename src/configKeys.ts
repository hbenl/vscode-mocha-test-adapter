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
	exit: { onChange: 'reloadConfig' },
	optsFile: { onChange: 'reloadTests' },
	nodePath: { onChange: 'reloadTests' },
	mochaPath: { onChange: 'reloadTests' },
	monkeyPatch: { onChange: 'reloadTests' },
	debuggerPort: { onChange: 'reloadConfig' },
	skipFrames: { onChange: 'reloadTests' },
	enableHmr: { onChange: 'reloadTests' },
	debuggerConfig: { onChange: 'reloadConfig' },
	launcherScript: { onChange: 'reloadTests'},
	nodeArgs: { onChange: 'reloadTests'},
	logpanel: {},
	logfile: {},
};

export const configKeys: { [key: string]: ConfigKeyInfo } = {};
for (const key in rawConfigKeys) {
	configKeys[key] = { key, fullKey: `${configSection}.${key}`, onChange: rawConfigKeys[key].onChange };
}

import assert from 'assert';
import Module from 'module';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ConfigReader only needs these workspace subscriptions for this test.
const vscode = { workspace: {
	onDidChangeConfiguration: () => ({ dispose() {} }),
	onDidSaveTextDocument: () => ({ dispose() {} })
} };
const originalLoad = (Module as any)._load;
let ConfigReader: typeof import('../configReader').ConfigReader;
try {
	(Module as any)._load = function(name: string, ...args: any[]) {
		return name === 'vscode' ? vscode : originalLoad.call(this, name, ...args);
	};
	ConfigReader = require('../configReader').ConfigReader;
} finally {
	(Module as any)._load = originalLoad;
}

describe('ConfigReader environment diagnostics', function() {
	it('logs variable names without values and preserves environment merging', async function() {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mocha-env-'));
		const logs: string[] = [];
		fs.writeFileSync(path.join(directory, '.env'), 'API_TOKEN=overridden-secret\nDOTENV_TOKEN=dotenv-secret\n');
		const reader = new ConfigReader(
			{ uri: { fsPath: directory } } as any,
			{} as any, async () => {}, () => {},
			{ enabled: true, debug: (message: string) => logs.push(message) } as any
		);
		try {
			const config = { get: (key: string) => key === 'env'
				? { API_TOKEN: 'config-secret', UNSET: null }
				: key === 'envPath' ? '.env' : undefined };
			const env = await (reader as any).getEnv(config, { requires: [] });
			assert.deepStrictEqual(env, {
				API_TOKEN: 'config-secret', DOTENV_TOKEN: 'dotenv-secret', UNSET: null
			});
			assert.ok(logs.some(message => message.includes('API_TOKEN')));
			assert.ok(logs.some(message => message.includes('UNSET')));
			for (const secret of ['config-secret', 'dotenv-secret', 'overridden-secret']) {
				assert.ok(logs.every(message => !message.includes(secret)), 'Environment values must not appear in diagnostics');
			}
		} finally {
			reader.dispose();
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});
});

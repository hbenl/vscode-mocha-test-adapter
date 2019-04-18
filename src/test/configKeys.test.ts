import * as path from 'path';
import * as fs from 'fs';
import { configKeys, configSection } from '../configKeys';
import assert from 'assert';

describe("The configKeys", function() {

	it("should be consistent", function() {
		for (const property in configKeys) {
			assert.strictEqual(configKeys[property].key, property);
			assert.strictEqual(configKeys[property].fullKey, `${configSection}.${property}`);
		}
	});

	it("should match the contributed configuration properties from package.json", function() {

		const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
		const properties: any = { ...packageJson.contributes.configuration.properties };
		for (const key in configKeys) {

			const fullKey = configKeys[key].fullKey;
			assert.ok(properties[fullKey], `Configuration property "${fullKey}" not defined in package.json`);

			delete properties[fullKey];
		}

		if (Object.keys(properties).length > 0) {
			assert.fail(`Configuration properties ${JSON.stringify(Object.keys(properties))} not defined in configKeys`);
		}
	});
});

import * as fs from 'fs';
import { MochaOpts } from './opts';

export interface WorkerArgs {
	testFiles: string[];
	tests?: string[];
	mochaPath: string;
	mochaOpts: MochaOpts;
	monkeyPatch?: boolean;
	logEnabled: boolean;
}

export interface ErrorInfo {
	type: 'error';
	errorMessage: string;
}

export function readFile(path: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		fs.readFile(path, 'utf8', (err, data) => {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		})
	});
}

import { MochaOpts } from './opts';

export interface WorkerArgs {
	action: 'loadTests' | 'runTests';
	testFiles: string[];
	tests?: string[];
	mochaPath: string;
	mochaOpts: MochaOpts;
	monkeyPatch?: boolean;
	ipcPort?: number;
	logEnabled: boolean;
}

export interface ErrorInfo {
	type: 'error';
	errorMessage: string;
}

export function copyOwnProperties(orig: any): any {
	const copy: any = {};
	for (const property of Object.getOwnPropertyNames(orig)) {
		copy[property] = orig[property];
	}
	return copy;
}

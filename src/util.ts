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

export function copyOwnProperties(orig: any): any {
	const copy: any = {};
	for (const property of Object.getOwnPropertyNames(orig)) {
		copy[property] = orig[property];
	}
	return copy;
}

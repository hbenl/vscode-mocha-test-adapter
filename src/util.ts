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

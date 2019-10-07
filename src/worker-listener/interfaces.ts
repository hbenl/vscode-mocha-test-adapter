import { WorkerEvent, WorkerArgsAugmented } from '../interfaces';
import { WorkerArgs } from 'vscode-test-adapter-remoting-util/out/mocha';

export interface IWorkerInstance {
	/** Stops all running sessions on this worker */
	stop(): void;
	/** Force kill worker */
	kill(): void;
	/** Pre-launches the worker process if necessary (so it can be attached before sending its execution arguments) */
	spawn(): void;
	/** Sends a command to worker */
	execute(args: WorkerArgsAugmented, changedFiles?: string[]): IWorkerSession;
	/** Registers a handler which will be called when the process dies */
	onExit(exitHandler: () => void): void;
	/** Registers a handler which will be called when the process declares HMR support */
	onDetectHmr(handler: () => void): void;
	/** To be called when a session detects HMR ... this will make the current worker instance reusable */
	detectedHmr(): void;
	/** Returns true if the given config is the same that has been used to start the launcher */
	accepts(args: WorkerArgs): boolean;
}

export interface IWorkerSession {
	/**
	 * Waits until this session signals it has finished its initial run.
	 * For most sessions, it will also likely be the end of the session.
	 * However, HMR sessions continue to run in the background (they send events)
	 */
	waitInitialRun(): Promise<void>;
	/**
	 * Waits the end of this session
	 */
	waitEnd(): Promise<void>;
	onStdout(data: string): void;
	onStderr(data: string): void;
	processMessage(info: WorkerEvent): 'stop' | 'continue';
	finished(error?: any): void;
}

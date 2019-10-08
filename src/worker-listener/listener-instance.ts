import { AdapterConfig } from '../configReader';
import { ChildProcess, fork } from 'child_process';
import { stringsOnly, areCompatibleRunners } from '../util';
import { WorkerArgsAugmented, WorkerEvent, IAdapterCore } from '../interfaces';
import { IWorkerInstance, IWorkerSession } from './interfaces';
import { LoadSession } from './load-session';
import { RunSession } from './run-session';
import * as util from 'util';

let debugPort = 12345;
export class WorkerInstance implements IWorkerInstance {

	private childProc?: ChildProcess;
	private sessCnt = 0;
	private sessions = new Map<number, IWorkerSession>();
	private exitHandlers: (() => void)[] = [];
	private hmrDetectHandlers: (() => void)[] = [];
	private firstArgs?: WorkerArgsAugmented;

	constructor(
		private adapter: IAdapterCore
		, private config: AdapterConfig
		, private childProcScript: string) {
	}

	private logInfo(data: any) {
		if (this.adapter.log.enabled) {
			this.adapter.log.info(data);
		}
	}
	private logWarn(data: any) {
		if (this.adapter.log.enabled) {
			this.adapter.log.warn(data);
		}
	}
	private logError(data: any) {
		if (this.adapter.log.enabled) {
			this.adapter.log.error(data);
		}
	}

	kill() {
		if (!this.childProc) {
			return;
		}
		this.childProc.kill();
		this.childProc = undefined;
		this.doFinish();
	}

	onExit(exitHandler: () => void) {
		this.exitHandlers.push(exitHandler);
	}

	onDetectHmr(handler: () => void): void {
		this.hmrDetectHandlers.push(handler);
	}

	detectedHmr() {
		for (const h of this.hmrDetectHandlers) {
			h();
		}
		this.hmrDetectHandlers = [];
	}


	spawn(forceDebug?: boolean) {
		if (this.childProc) {
			return;
		}
		let execArgv: string[] = [];
		if (this.config.hmrBundle || forceDebug && !this.config.launcherScript) {
			execArgv = [`--inspect=${this.config.debuggerPort}`];
		}
		// execArgv =  ['--inspect-brk=' + (debugPort++)];
		if (this.config.nodeArgs) {
			execArgv.push(this.config.nodeArgs);
		}
		this.childProc = fork(
			this.childProcScript,
			[],
			{
				execPath: this.config.nodePath,
				execArgv,
				env: stringsOnly({ ...process.env, ...this.config.env }),
				stdio: ['pipe', 'pipe', 'pipe', 'ipc']
			}
		);

		this.childProc.on('message', (info: string | WorkerEvent) => {

			// handle logging
			if (typeof info === 'string') {
				this.logInfo(`Worker: ${info}`);
				return;
			}
			this.logInfo(`Received ${JSON.stringify(info)}`);

			// handle legacy 'null' message for 'no test found'
			if (!info) {
				if (!this.config.hmrBundle) {
					this.logWarn(`Received 'null' message when HMR enabled (expected runner session ID)`);
				}
				info = { type: 'noTest' };
			}

			// get associated session
			const session = this.sessions.get(info.sessionId || 0);
			if (!session) {
				this.logWarn(`Received message from worker for an unknown session: ${info.sessionId || 0}`);
				return;
			}

			// process message
			const result = session.processMessage(info);

			// kill process
			if (result === 'stop') { // (!this.config.enableHmr || !this.hmrHandled) && !this.config.launcherScript
				this.stopSession(info.sessionId || 0);
			}
		});

		// subscribe to STDIN/STDOUT
		const parseOut = (data: any, process: (session: IWorkerSession, txt: string) => void) => {
			const str = data.toString();
			let [success, sid, text] = /^(\d+):(.*)$/.exec(str) || [null, null, null];
			if (!success) {
				sid = '0';
				text = str;
			}
			const session = this.sessions.get(parseInt(sid || '0', 10) || 0);
			if (session) {
				process(session, text || '');
			}
		}
		this.childProc.stdout.on('data', data => parseOut(data, (s, t) => s.onStdout(t)));
		this.childProc.stderr.on('data', data => parseOut(data, (s, t) => s.onStderr(t)));

		// on exit
		this.childProc.on('exit', (code, signal) => {
			this.logInfo(`Worker finished with code ${code} and signal ${signal}`);
			const err = code || signal
				? { code, signal }
				: undefined;

			this.doFinish(err);
		});

		// on error
		this.childProc.on('error', err => {
			this.logError(`Error from child process: ${util.inspect(err)}`);
			this.doFinish(err);
		});
	}

	private doFinish(err?: any) {
		// call exit handlers
		for (const handler of this.exitHandlers) {
			handler();
		}

		// finish all sessions
		for (const s of this.sessions.values()) {
			s.finished(err);
		}
		this.sessions.clear();
	}


	execute(args: WorkerArgsAugmented, changedFiles?: string[]): IWorkerSession {
		if (this.config.hmrBundle) {
			args.sessionId = this.sessCnt++;
		}
		// spawn process
		this.spawn();

		if (!this.firstArgs) {
			this.firstArgs = args;
		}

		// create session handler
		let session: IWorkerSession;
		if (args.action === 'runTests') {
			session = new RunSession(this.adapter, this);
		} else if (args.action === 'loadTests') {
			session = new LoadSession(this.adapter, this, changedFiles);
		} else {
			throw new Error('Unknown worker action: ' + args.action);
		}
		this.sessions.set(args.sessionId || 0, session);

		// send arguments to process
		this.childProc!.send(args);
		return session;
	}

	accepts(args: WorkerArgsAugmented): boolean {
		if (!this.firstArgs) {
			return true;
		}
		return areCompatibleRunners(args, this.firstArgs);
	}

	private stopSession(sessionId: number) {
		// terminate session
		const session = this.sessions.get(sessionId || 0);
		if (!session) {
			return;
		}
		session.finished();
		this.sessions.delete(sessionId);

		// if a session is still running, then ignore
		if (this.sessions.size) {
			return;
		}

		this.stop();
	}

	stop() {
		if (!this.childProc) {
			return;
		}

		// kill process, or send a graceful exit message
		if (this.config.mochaOpts.exit || !this.childProc.connected) {
			this.childProc.kill()
		} else {
			try {
				this.childProc.send({ exit: true });
			} catch (e) {
				this.logWarn('Failed to gracefully stop worker process => killing it')
				this.childProc.kill()
			}
		}
		this.childProc = undefined;
	}
}

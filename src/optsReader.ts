import * as fs from 'fs';
import * as util from 'util';
import { MochaOpts } from './opts';
import { ILog } from './core';

export interface MochaOptsAndFiles {
	mochaOpts: Partial<MochaOpts>;
	globs: string[];
	files: string[];
}

export class MochaOptsReader {

	private static readonly booleanOpts = [
		'--allow-uncaught',
		'--async-only', '-A',
		'--bail', '-b',
		'--check-leaks',
		'--color', '--colors', '-c',
		'--debug', '-d',
		'--debug-brk',
		'--delay',
		'--diff',
		'--es_staging',
		'--exit',
		'--expose-gc', '-gc',
		'--forbid-only',
		'--forbid-pending',
		'--full-trace',
		'--growl', '-G',
		'--icu-data-dir',
		'--inline-diffs',
		'--inspect',
		'--inspect-brk',
		'--invert', '-i',
		'--log-timer-events',
		'--napi-modules',
		'--no-colors', '-C',
		'--no-deprecation',
		'--no-timeouts',
		'--no-warnings',
		'--perf-basic-prof',
		'--preserve-symlinks',
		'--prof',
		'--recursive',
		'--sort', '-S',
		'--throw-deprecation',
		'--trace',
		'--trace-deprecation',
		'--trace-warnings',
		'--use_strict',
		'--watch', '-w'
	];

	constructor(
		private readonly log: ILog
	) {}

	readMochaOptsFile(file: string): Promise<MochaOptsAndFiles> {

		if (this.log.enabled) this.log.debug(`Looking for mocha options in ${file}`);

		return new Promise<MochaOptsAndFiles>(resolve => {
			fs.readFile(file, 'utf8', (err, data) => {

				if (err) {
					if (this.log.enabled) {
						if (err.code === 'ENOENT') {
							this.log.debug('Couldn\'t read mocha.opts file');
						} else {
							this.log.debug(`Couldn't read mocha.opts file: ${util.inspect(err)}`);
						}
					}
					resolve({ mochaOpts: {}, globs: [], files: [] });
					return;
				}

				try {
					const opts = data
						.replace(/^#.*$/gm, '')
						.replace(/\\\s/g, '%20')
						.split(/\s/)
						.filter(Boolean)
						.map(value => value.replace(/%20/g, ' '));

					const globs = this.findPositionalArgs(opts);
					const files = this.findOptValues(['--file'], opts);
					const ui = this.findOptValue(['-u', '--ui'], opts);
					const timeoutString = this.findOptValue(['-t', '--timeout'], opts);
					const timeout = timeoutString ? Number.parseInt(timeoutString) : undefined;
					const retriesString = this.findOptValue(['--retries'], opts);
					const retries = retriesString ? Number.parseInt(retriesString) : undefined;
					const requires = this.findOptValues(['-r', '--require'], opts);
					const exit = (opts.indexOf('--exit') >= 0) ? true : undefined;

					const mochaOpts = { ui, timeout, retries, requires, exit };
					if (this.log.enabled) {
						this.log.debug(`Options from mocha.opts file: ${JSON.stringify(mochaOpts)}`);
						this.log.debug(`Globs from mocha.opts file: ${JSON.stringify(globs)}`);
						this.log.debug(`Files from mocha.opts file: ${JSON.stringify(files)}`);
					}

					resolve({ mochaOpts, globs, files });

				} catch (err) {
					if (this.log.enabled) this.log.debug(`Couldn't parse mocha.opts file: ${util.inspect(err)}`);
					resolve({ mochaOpts: {}, globs: [], files: [] });
				}
			});
		});
	}

	private findOptValue(needles: string[], haystack: string[]): string | undefined {

		let index: number | undefined;
		for (const needle of needles) {
			const needleIndex = haystack.lastIndexOf(needle);
			if ((needleIndex >= 0) && ((index === undefined) || (needleIndex > index))) {
				index = needleIndex;
			}
		}

		if ((index !== undefined) && (haystack.length > index + 1)) {
			return haystack[index + 1];
		} else {
			return undefined;
		}
	}

	private findOptValues(needles: string[], haystack: string[]): string[] {

		const values: string[] = [];

		for (let i = 0; i < haystack.length; i++) {
			if (needles.indexOf(haystack[i]) >= 0) {
				i++;
				if (i < haystack.length) {
					values.push(haystack[i]);
				}
			}
		}

		return values;
	}

	private findPositionalArgs(haystack: string[]): string[] {

		const args: string[] = [];

		for (let i = 0; i < haystack.length; i++) {
			if (haystack[i].startsWith('-')) {
				if (MochaOptsReader.booleanOpts.indexOf(haystack[i]) < 0) {
					i++;
				}
			} else {
				args.push(haystack[i]);
			}
		}

		return args;
	}
}

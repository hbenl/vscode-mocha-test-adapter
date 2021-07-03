/**
 * If a file watcher is configured, this class is used to debounce
 * file change events from the watcher.
 */
export class FileChangeDebouncer {

	private timeout: NodeJS.Timeout | undefined;
	private changedTestFiles: string[] = [];
	private nonTestFilesChanged = false;

	constructor(
		private debounceTime: number,
		private callback: (reload?: boolean, changedTestFiles?: string[]) => void
	) {}

	/**
	 * Report a file change event. If the changed file is a test file, set the
	 * testFile argument to its absolute path.
	 */
	fileChanged(testFile?: string) {
		if (testFile) {
			this.changedTestFiles.push(testFile);
		} else {
			this.nonTestFilesChanged = true;
		}

		if (this.timeout) {
			clearTimeout(this.timeout);
		}
		this.timeout = setTimeout(() => {
			this.callback(
				this.changedTestFiles.length > 0,
				this.nonTestFilesChanged ? undefined : this.changedTestFiles
			);
			this.changedTestFiles = [];
			this.nonTestFilesChanged = false;
		}, this.debounceTime);
	}

	/**
	 * Forget the file change events that were reported so far.
	 */
	reset() {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
			this.changedTestFiles = [];
			this.nonTestFilesChanged = false;
		}
	}

	dispose() {
		if (this.timeout) {
			this.callback(
				this.changedTestFiles.length > 0,
				this.nonTestFilesChanged ? undefined : this.changedTestFiles
			);
			this.timeout = undefined;
			this.changedTestFiles = [];
			this.nonTestFilesChanged = false;
		}
	}
}

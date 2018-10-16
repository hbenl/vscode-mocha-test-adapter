const Path = require('path');
const PathRemote = Path.posix;
const PathLocal = Path.win32;
const localRoot = String.raw `C:\Users\abradley\Documents\Personal-dev\@hbenl\vscode-mocha-test-adapter\test-workspace`;
const remoteRoot = '/home/circleci';
/** @type {import('../src/worker/plugin').WorkerPlugin} */
const plugin = {
	convertAbsoluteLocalPathToRemote(path) {
		const winWorkspaceRelative = Path.win32.relative(localRoot, path);
		const linuxWorkspaceRelative = winToPosixSep(winWorkspaceRelative);
		return Path.posix.resolve(remoteRoot, linuxWorkspaceRelative);
	},
	convertAbsoluteRemotePathToLocal(path) {
		const remoteWorkspaceRelative = Path.posix.relative(remoteRoot, path);
		const localWorkspaceRelative = posixToWinSep(remoteWorkspaceRelative);
		return Path.win32.resolve(localRoot, localWorkspaceRelative);
	},
	convertRelativeLocalPathToRemote(path) {
		return winToPosixSep(path);
	},
	convertRelativeRemotePathToLocal(path) {
		return posixToWinSep(path);
	}
}

function winToPosixSep(path) {
	return path.split(Path.win32.sep).join(Path.posix.sep);
}
function posixToWinSep(path) {
	return path.split(Path.win32.sep).join(Path.posix.sep);
}

module.exports = plugin;

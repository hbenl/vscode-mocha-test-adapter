export interface WorkerPlugin {
	convertAbsoluteLocalPathToRemote(path: string): string;
	convertAbsoluteRemotePathToLocal(path: string): string;
	convertRelativeLocalPathToRemote(path: string): string;
	convertRelativeRemotePathToLocal(path: string): string;
}

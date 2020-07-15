export function parseStackTrace(e: Error | string) {
	const stackStr = typeof e === 'string'
		? e
		: e.stack;
	if (!stackStr) {
		return [];
	}

	const lines = stackStr.split('\n').slice(1);
	const stack = [];
	for (const l of lines) {
		// match
		const lineMatch = l.match(/at (?:(.+)\s+\()?(?:(.+?):(\d+)(?::(\d+))?|([^)]+))\)?/);
		if (!lineMatch) {
			continue;
		}

		// from https://github.com/felixge/node-stack-trace/blob/master/lib/stack-trace.js
		var object = null;
		var method = null;
		var functionName = null;
		var typeName = null;
		var methodName = null;
		var isNative = (lineMatch[5] === 'native');

		if (lineMatch[1]) {
		  functionName = lineMatch[1];
		  var methodStart = functionName.lastIndexOf('.');
		  if (functionName[methodStart-1] == '.')
			methodStart--;
		  if (methodStart > 0) {
			object = functionName.substr(0, methodStart);
			method = functionName.substr(methodStart + 1);
			var objectEnd = object.indexOf('.Module');
			if (objectEnd > 0) {
			  functionName = functionName.substr(objectEnd + 1);
			  object = object.substr(0, objectEnd);
			}
		  }
		  typeName = null;
		}

		if (method) {
		  typeName = object;
		  methodName = method;
		}

		if (method === '<anonymous>') {
		  methodName = null;
		  functionName = null;
		}

		var properties = {
		  fileName: lineMatch[2] || null,
		  lineNumber: parseInt(lineMatch[3], 10) || null,
		  functionName: functionName,
		  typeName: typeName,
		  methodName: methodName,
		  columnNumber: parseInt(lineMatch[4], 10) || null,
		  'native': isNative,
		};
		stack.push(properties);
	}
	return stack;
}
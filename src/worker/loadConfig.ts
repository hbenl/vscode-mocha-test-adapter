import * as yargs from "yargs";

function requireMochaCliOptions(): { loadOptions: (argv?: string | string[]) => {}, YARGS_PARSER_CONFIG?: {} } {
	try {
		// Mocha >=12 renamed this module to lib/cli/options.cjs
		// (lib/cli/options is now an ESM-only module)
		return require('mocha/lib/cli/options.cjs');
	} catch (err) {
		return require('mocha/lib/cli/options');
	}
}

const { loadOptions, YARGS_PARSER_CONFIG } = requireMochaCliOptions();

let args: yargs.Arguments = loadOptions(process.argv.slice(2)) as any;

(
	async () => {
		process.send!(
			yargs.parserConfiguration(
				YARGS_PARSER_CONFIG ?? {}).config(
					args).parse(args._ as any));
	})();

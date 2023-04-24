import { loadOptions } from 'mocha/lib/cli/options';
import * as yargs from "yargs";

let args: yargs.Arguments = loadOptions(process.argv.slice(2)) as any;

(
	async () => {
		process.send!(
			yargs.parserConfiguration(
				require("mocha/lib/cli/options").YARGS_PARSER_CONFIG ?? {}).config(
					args).parse(args._ as any));
	})();

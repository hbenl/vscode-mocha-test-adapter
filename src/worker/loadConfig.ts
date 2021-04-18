import { loadOptions } from 'mocha/lib/cli/options';

process.send!(loadOptions(process.argv.slice(2)));

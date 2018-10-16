import { doStuff } from "./helper";
import * as assert from 'assert';

type A =







// Ensure that sourcemaps are doing their job





any;
describe('my test suite', () => {
	console.log('Hello from my test suite');
	for(const i of [1, 2, 3, 4, 5]) {
		it(`my test case #${ i }`, () => {
			console.log(`Hello from my test case ${ i }`);
			debugger;
			doStuff();
			assert(i === 3);
		});
	}
});

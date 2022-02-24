import { sequence, str } from './parser';

function app() {
	const parser = sequence([str('1'), str('2')]);

	const input = '123';
	const task = parser(input);

	let result;
	do {
		result = task.step();
		console.log(result.done, result.value);
	} while (!result.done);
}
app();

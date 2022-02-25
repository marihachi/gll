import { choice, sequence, str } from './parser';

function app() {
	const parser = choice([
		sequence([str('1'), str('2')]),
		sequence([str('3'), str('4')]),
		sequence([str('5'), str('6')]),
	]);

	let input = '12345';
	while (true) {
		const task = parser(input);

		let result;
		do {
			result = task.step();
			if (result.done) {
				console.log('done', result.value);
			} else {
				console.log('pending');
			}
		} while (!result.done);

		if (!result.value.ok) break;
		input = result.value.remaining;
	}
}
app();

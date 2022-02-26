import { choice, sequence, str } from './parser';

function app() {
	const parser = choice([
		sequence([str('1'), str('2')]),
		sequence([str('3'), str('4')]),
		sequence([str('5'), str('6')]),
	]);

	let input = '12345';
	while (true) {
		const task = parser.parse(input);

		let done;
		do {
			done = task.step();
			if (done) {
				console.log('done', task.result);
			} else {
				console.log('pending');
			}
		} while (!done);

		const match = task.result!;
		if (!match.success) break;
		input = match.remaining;
	}
}
app();

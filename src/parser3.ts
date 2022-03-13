import deepEqual from 'deep-equal';

// memo

export function memoize<T extends unknown[], U>(fn: (...args: T) => U): (...args: T) => U {
	const memo: { args: T, result: U }[] = [];
	return (...args: T) => {
		let item = memo.find(i => {
			if (i.args.length != args.length) return false;
			return deepEqual(i.args, args);
		});
		if (item == null) {
			//console.log('add memo:', args);
			const result = fn(...args);
			item = { args, result };
			memo.push(item);
			return result;
		} else {
			//console.log('found memo:', args);
			return item.result;
		}
	};
}

// result

export type Success<T = any> = {
	success: true;
	result: T;
	remaining: string;
};

export type Failure = {
	success: false;
};

const failure: Failure = {
	success: false,
};

export type Result<T = any> = Success<T> | Failure;

// combinator

export type Combinator<T extends unknown[]> = (...args: T) => Parser;

// parser

export type Parser = (input: string) => ParserTask;

// parser task

export type ParserTaskHandler = (success: TaskSuccess, failure: TaskFailure) => void;
export type TaskSuccess = (result: any, remaining: string) => void;
export type TaskFailure = () => void;

export class ParserTask {
	private handler: () => void;
	private ok: boolean;
	public result?: Result;

	constructor(handler: ParserTaskHandler) {
		this.ok = false;
		const successFn = (result: any, remaining: string) => {
			this.ok = true;
			this.result = {
				success: true,
				result: result,
				remaining: remaining,
			};
		};
		const failureFn = () => {
			this.ok = true;
			this.result = failure;
		};
		this.handler = () => { handler(successFn, failureFn); };
	}

	public get done(): boolean {
		return this.ok;
	}

	public step(): boolean {
		if (!this.ok) {
			this.handler();
		}
		return this.ok;
	}
}

// combinators

export const str: Combinator<[value: string]> = memoize((value) => {
	return memoize((input) => {
		return new ParserTask((success, failure) => {
			if (input.startsWith(value)) {
				const remaining = input.substr(value.length);
				//console.log('[str] success:', value);
				return success(value, remaining);
			}
			//console.log('[str] failure:', value);
			return failure();
		});
	});
});

export const choice: Combinator<[parsers: Parser[]]> = memoize((parsers) => {
	return memoize((input) => {
		const tasks: ParserTask[] = [];
		for (const parser of parsers) {
			tasks.push(parser(input));
		}
		return new ParserTask((success, failure) => {
			for(const task of tasks) {
				task.step();
			}

			if (tasks.every(t => t.done)) {
				for (const task of tasks) {
					const match = task.result!;
					if (match.success) {
						//console.log('[choice] success');
						return success(match.result, match.remaining);
					}
				}
				//console.log('[choice] failure');
				return failure();
			}
			//console.log('[choice] pending');
		});
	});
});

export const sequence: Combinator<[parsers: Parser[]]> = memoize((parsers) => {
	return memoize((input) => {
		const result: any[] = [];
		let remaining = input;
		let i = 0;
		let task = parsers[i](remaining);
		return new ParserTask((success, failure) => {
			if (!task.step()) {
				//console.log('[seq] pending');
				return;
			}
			const match = task.result!;
			if (!match.success) {
				//console.log('[seq] failure');
				return failure();
			}
			result.push(match.result);
			remaining = match.remaining;
			if (i == parsers.length - 1) {
				//console.log('[seq] success');
				return success((result as any), remaining);
			}
			i++;
			task = parsers[i](remaining);
			//console.log('[seq] next');
		});
	});
});

function app() {
	const parser = choice([
		sequence([str('abc'), str('xyz')]),
		sequence([str('abc'), str('123')]),
		str('abc'),
		str('123'),
		str('xyz'),
	]);

	let input = 'abc123abcxyzabc';
	while (true) {
		console.log(`input: "${input}"`);
		const task = parser(input);

		let done;
		do {
			console.log('step');
			done = task.step();
			if (done) {
				console.log('<- done', task.result);
			} else {
				console.log('<- pending');
			}
		} while (!done);

		const match = task.result!;
		if (!match.success) break;
		input = match.remaining;
	}
}
app();

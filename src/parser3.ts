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

// combinator

export type Combinator<T extends unknown[], U = any> = (...args: T) => Parser<U>;

// parser

export type Parser<T = any> = (input: string) => ParserTask<T>;

// parser task

export type TaskSuccess = (result: any, remaining: string) => void;
export type TaskFailure = () => void;

type Success<T = any> = {
	success: true;
	result: T;
	remaining: string;
};

type Failure = {
	success: false;
};

const failure: Failure = {
	success: false,
};

export class ParserTask<T = any> {
	private handler: () => void;
	private resolved: boolean;
	public result?: Success<T> | Failure;

	constructor(handler: (success: TaskSuccess, failure: TaskFailure) => void) {
		this.resolved = false;
		const successFn = (result: any, remaining: string) => {
			this.resolved = true;
			this.result = {
				success: true,
				result: result,
				remaining: remaining,
			};
		};
		const failureFn = () => {
			this.resolved = true;
			this.result = failure;
		};
		this.handler = () => { handler(successFn, failureFn); };
	}

	public get done(): boolean {
		return this.resolved;
	}

	public step() {
		if (!this.resolved) {
			this.handler();
		}
		return this.resolved;
	}
}

// combinators

export const str = memoize((value: string) => {
	return memoize((input: string) => {
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

export const choice = memoize((parsers: Parser[]) => {
	return memoize((input: string) => {
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

export const sequence = memoize((parsers: Parser[]) => {
	return memoize((input: string) => {
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

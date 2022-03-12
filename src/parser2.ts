import deepEqual from 'deep-equal';

type Args<T> = T extends (...x: infer U) => unknown ? U : never;

// result

export type Success = {
	success: true;
	result: any;
	remaining: string;
};

export type Failure = {
	success: false;
};

const failure: Failure = {
	success: false,
};

export type Result = Success | Failure;

// combinator

export type CombinatorHandler = (...x: any[]) => ParserHandler;

export function combinator<T extends CombinatorHandler>(name: string, handler: T): (...args: Args<T>) => Parser {
	const memo: { args: any[], parser: Parser }[] = [];
	return (...args: any[]) => {
		let record = memo.find(item => {
			if (item.args.length != args.length) return false;
			return deepEqual(item.args, args);
		});
		if (record == null) {
			//console.log('set parser:', name, args);
			const parserHandler = handler(...args);
			const parser = createParser(name, parserHandler);
			record = { args, parser };
			memo.push(record);
		} else {
			//console.log('hit parser:', name, args);
		}

		return record.parser;
	};
}

// parser

export type Parser = (input: string) => ParserTask;
export type ParserHandler = (input: string) => ParserTaskHandler;

export function createParser(name: string, handler: ParserHandler): Parser {
	const memo: Map<string, ParserTask> = new Map();
	return (input: string) => {
		let task = memo.get(input);
		if (task == null) {
			//console.log('set task:', name);
			const taskHandler = handler(input);
			task = new ParserTask(taskHandler);
			memo.set(input, task);
		} else {
			//console.log('hit task:', name);
		}
		return task;
	};
}

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

export const str = combinator('str', (value: string) => {
	return (input) => {
		return (success, failure) => {
			if (input.startsWith(value)) {
				const remaining = input.substr(value.length);
				//console.log('[str] success:', value);
				return success(value, remaining);
			}
			//console.log('[str] failure:', value);
			return failure();
		};
	};
});

export const choice = combinator('choice', (parsers: Parser[]) => {
	return (input) => {
		const tasks: ParserTask[] = [];
		for (const parser of parsers) {
			tasks.push(parser(input));
		}
		return (success, failure) => {
			for(const task of tasks) {
				if (task.step()) {
					const match = task.result!;
					if (match.success) {
						//console.log('[choice] success');
						return success(match.result, match.remaining);
					}
				}
			}
			if (tasks.every(t => t.done)) {
				//console.log('[choice] failure');
				return failure();
			}
			//console.log('[choice] pending');
		};
	};
});

export const sequence = combinator('sequence', (parsers: Parser[]) => {
	return (input) => {
		const result: any[] = [];
		let remaining = input;
		let i = 0;
		let task = parsers[i](remaining);
		return (success, failure) => {
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
		};
	};
});

function app() {
	const parser = choice([
		sequence([str('abc'), str('xyz')]),
		sequence([str('abc'), str('123')]),
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

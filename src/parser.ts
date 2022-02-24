// parser

export type Success<T> = {
	ok: true;
	result: T;
	remaining: string;
};

export type Failure = {
	ok: false;
};

const failure: Failure = {
	ok: false,
};

export type Result<T> = Success<T> | Failure;

export type ParserContext<T> = {
	success: (result: T, remaining: string) => void;
	failure: () => void;
};

export type ParserHandler<T> = (ctx: ParserContext<T>) => void;

export type StepResult<T> = {
	done?: false;
	value: undefined;
} | {
	done: true;
	value: Result<T>;
};

export class ParserTask<T> {
	private ctx: ParserContext<T>;
	private handler: ParserHandler<T>;
	public done: boolean;
	private result?: Result<T>;

	constructor(handler: ParserHandler<T>) {
		this.done = false;
		this.ctx = {
			success: (result: T, remaining: string) => {
				this.done = true;
				this.result = {
					ok: true,
					result: result,
					remaining: remaining,
				};
			},
			failure: () => {
				this.done = true;
				this.result = failure;
			}
		};
		this.handler = handler;
	}

	public step(): StepResult<T> {
		if (!this.done) {
			this.handler(this.ctx);
		}
		if (this.done) {
			return { done: true, value: this.result! };
		} else {
			return { done: false, value: undefined };
		}
	}
}

export type Parser<T> = (input: string) => ParserTask<T>;

export type InferParserResult<T> = T extends Parser<infer U> ? U : never;

export type InferParserResults<T> = T extends [infer U, ...infer V] ? [InferParserResult<U>, ...InferParserResults<V>] : [];

// parsers

export function str(value: string): Parser<string> {
	return (input) => {
		return new ParserTask((ctx) => {
			if (input.startsWith(value)) {
				const remaining = input.substr(value.length);
				return ctx.success(value, remaining);
			}
			return ctx.failure();
		});
	};
}

export function regex(pattern: RegExp): Parser<RegExpExecArray> {
	return (input) => {
		return new ParserTask((ctx) => {
			const match = pattern.exec(input);
			if (match == null) {
				return ctx.failure();
			}
			const remaining = input.substr(match[0].length);
			return ctx.success(match, remaining);
		});
	};
}

// NOTE: Tの制約が思いつくまでは`Parser<any>`
export function choice<T extends Parser<any>>(parsers: T[]): Parser<InferParserResult<T>> {
	return (input) => {
		const tasks: ParserTask<InferParserResult<T>>[] = [];
		for (const parser of parsers) {
			tasks.push(parser(input));
		}
		return new ParserTask((ctx) => {
			for(const task of tasks) {
				const stepResult = task.step();
				if (stepResult.done) {
					const match = stepResult.value;
					if (match.ok) {
						return ctx.success(match.result, match.remaining);
					}
				}
			}
			if (tasks.every(t => t.done)) {
				return ctx.failure();
			}
		});
	};
}

// NOTE: Tの制約が思いつくまでは`Parser<any>[]`
// NOTE: resultの型が思いつくまでは`any`
export function sequence<T extends Parser<any>[]>(parsers: [...T]): Parser<InferParserResults<T>> {
	return (input: string) => {
		const result: any[] = [];
		let remaining = input;
		let index = 0;
		let task = parsers[0](input);
		return new ParserTask((ctx) => {
			let match;
			const stepResult = task.step();
			if (!stepResult.done) return;
			match = stepResult.value;
			if (!match.ok) {
				return ctx.failure();
			}
			result.push(match.result);
			remaining = match.remaining;
			index++;
			if (index >= parsers.length) {
				return ctx.success((result as any), remaining);
			}
			task = parsers[index](remaining);
		});
	};
}

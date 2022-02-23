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

export class ParserStream<T> {
	private ctx: ParserContext<T>;
	private handler: ParserHandler<T>;
	public done: boolean;
	private result: Result<T> | undefined;

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

	public next(): IteratorResult<undefined, Result<T>> {
		if (!this.done) {
			this.handler(this.ctx);
		}
		if (this.done) {
			return { done: true, value: this.result! };
		} else {
			return { done: false, value: undefined };
		}
	}

	public [Symbol.iterator]() {
		return this;
	}
}

export type Parser<T> = (input: string) => ParserStream<T>;

export type InferParserResult<T> = T extends Parser<infer U> ? U : never;

export type InferParserResults<T> = T extends [infer U, ...infer V] ? [InferParserResult<U>, ...InferParserResults<V>] : [];

// parsers

export function str(value: string): Parser<string> {
	return (input) => {
		return new ParserStream((ctx) => {
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
		return new ParserStream((ctx) => {
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
		const streams: ParserStream<InferParserResult<T>>[] = [];
		for (const parser of parsers) {
			streams.push(parser(input));
		}
		return new ParserStream((ctx) => {
			for(const stream of streams) {
				const streamResult = stream.next();
				if (streamResult.done) {
					const match = streamResult.value;
					if (match.ok) {
						return ctx.success(match.result, match.remaining);
					}
				}
			}
			if (streams.every(t => t.done)) {
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
		let stream = parsers[0](input);
		return new ParserStream((ctx) => {
			let match;
			const streamResult = stream.next();
			if (!streamResult.done) return;
			match = streamResult.value;
			if (!match.ok) {
				return ctx.failure();
			}
			result.push(match.result);
			remaining = match.remaining;
			index++;
			if (index >= parsers.length) {
				return ctx.success((result as any), remaining);
			}
			stream = parsers[index](remaining);
		});
	};
}

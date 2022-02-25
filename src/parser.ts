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

export type ParserSuccess<T> = (result: T, remaining: string) => void;

export type ParserFailure = () => void;

export type ParserHandler<T> = (success: ParserSuccess<T>, failure: ParserFailure) => void;

export type StepResult<T> = {
	done: false;
} | {
	done: true;
	value: T;
};

export class ParserTask<T> {
	private handler: () => void;
	public done: boolean;
	public match?: Result<T>;

	constructor(handler: ParserHandler<T>) {
		this.done = false;
		const successFn = (result: T, remaining: string) => {
			this.done = true;
			this.match = {
				ok: true,
				result: result,
				remaining: remaining,
			};
		};
		const failureFn = () => {
			this.done = true;
			this.match = failure;
		};
		this.handler = () => handler(successFn, failureFn);
	}

	public step(): StepResult<Result<T>> {
		if (!this.done) {
			this.handler();
		}
		if (this.done) {
			return { done: true, value: this.match! };
		} else {
			return { done: false };
		}
	}
}

export type Parser<T> = (input: string) => ParserTask<T>;

export type InferParserResult<T> = T extends Parser<infer U> ? U : never;

export type InferParserResults<T> = T extends [infer U, ...infer V] ? [InferParserResult<U>, ...InferParserResults<V>] : [];

// parsers

export function str(value: string): Parser<string> {
	return (input) => {
		return new ParserTask((success, failure) => {
			if (input.startsWith(value)) {
				const remaining = input.substr(value.length);
				return success(value, remaining);
			}
			return failure();
		});
	};
}

export function regex(pattern: RegExp): Parser<RegExpExecArray> {
	return (input) => {
		return new ParserTask((success, failure) => {
			const match = pattern.exec(input);
			if (match == null) {
				return failure();
			}
			const remaining = input.substr(match[0].length);
			return success(match, remaining);
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
		return new ParserTask((success, failure) => {
			for(const task of tasks) {
				const stepResult = task.step();
				if (stepResult.done) {
					const match = stepResult.value;
					if (match.ok) {
						return success(match.result, match.remaining);
					}
				}
			}
			if (tasks.every(t => t.done)) {
				return failure();
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
		return new ParserTask((success, failure) => {
			let match;
			const stepResult = task.step();
			if (!stepResult.done) return;
			match = stepResult.value;
			if (!match.ok) {
				return failure();
			}
			result.push(match.result);
			remaining = match.remaining;
			index++;
			if (index >= parsers.length) {
				return success((result as any), remaining);
			}
			task = parsers[index](remaining);
		});
	};
}

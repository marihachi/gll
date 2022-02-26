// parser

export type Success<T> = {
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
	private ok: boolean;
	private match?: Result<T>;

	constructor(handler: ParserHandler<T>) {
		this.ok = false;
		const successFn = (result: T, remaining: string) => {
			this.ok = true;
			this.match = {
				success: true,
				result: result,
				remaining: remaining,
			};
		};
		const failureFn = () => {
			this.ok = true;
			this.match = failure;
		};
		this.handler = () => { handler(successFn, failureFn); };
	}

	public get done(): boolean {
		return this.ok;
	}

	public step(): StepResult<Result<T>> {
		if (!this.ok) {
			this.handler();
		}
		if (this.ok) {
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
		});
	};
}

// NOTE: Tの制約が思いつくまでは`Parser<any>[]`
// NOTE: resultの型が思いつくまでは`any`
export function sequence<T extends Parser<any>[]>(parsers: [...T]): Parser<InferParserResults<T>> {
	return (input: string) => {
		const result: any[] = [];
		let remaining = input;
		let i = 0;
		let task = parsers[i](remaining);
		return new ParserTask((success, failure) => {
			let stepResult = task.step();
			if (!stepResult.done) {
				//console.log('[seq] pending');
				return;
			}
			const match = stepResult.value;
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
	};
}

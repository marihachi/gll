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

export type ParserHandler<T> = (input: string) => ParserTask<T>;

export class Parser<T> {
	public id: string;
	private static parserMemo: Record<string, Parser<any>> = {};
	private memo: Record<string, ParserTask<T>> = {};
	private handler: ParserHandler<T>;

	constructor(id: string, handler: ParserHandler<T>) {
		this.id = id;
		this.handler = handler;
	}

	public static create<T>(id: string, handler: ParserHandler<T>): Parser<T> {
		let parser = Parser.parserMemo[id];
		if (parser != null) {
			//console.log('hit parser:', id);
			return parser;
		}
		//console.log('memo parser:', id);
		parser = new Parser(id, handler);
		Parser.parserMemo[id] = parser;
		return parser;
	}

	public parse(input: string): ParserTask<T> {
		let task = this.memo[input];
		if (task != null) {
			//console.log('hit input');
			return task;
		}
		task = this.handler(input);
		this.memo[input] = task;
		return task;
	}
}

export type ParserTaskHandler<T> = (success: ParserSuccess<T>, failure: ParserFailure) => void;

export class ParserTask<T> {
	private handler: () => void;
	private ok: boolean;
	public result?: Result<T>;

	constructor(handler: ParserTaskHandler<T>) {
		this.ok = false;
		const successFn = (result: T, remaining: string) => {
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

export type InferParserResult<T> = T extends Parser<infer U> ? U : never;

export type InferParserResults<T> = T extends [infer U, ...infer V] ? [InferParserResult<U>, ...InferParserResults<V>] : [];

// parsers

export function str(value: string): Parser<string> {
	return Parser.create(`str{${value}}`, (input) => {
		return new ParserTask((success, failure) => {
			if (input.startsWith(value)) {
				const remaining = input.substr(value.length);
				return success(value, remaining);
			}
			return failure();
		});
	});
}

export function regex(pattern: RegExp): Parser<RegExpExecArray> {
	return Parser.create(`reg{${pattern.source}}`, (input) => {
		return new ParserTask((success, failure) => {
			const match = pattern.exec(input);
			if (match == null) {
				return failure();
			}
			const remaining = input.substr(match[0].length);
			return success(match, remaining);
		});
	});
}

// NOTE: Tの制約が思いつくまでは`Parser<any>`
export function choice<T extends Parser<any>>(parsers: T[]): Parser<InferParserResult<T>> {
	return Parser.create(`alt{${parsers.map(i => i.id).join(',')}}`, (input) => {
		const tasks: ParserTask<InferParserResult<T>>[] = [];
		for (const parser of parsers) {
			tasks.push(parser.parse(input));
		}
		return new ParserTask((success, failure) => {
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
		});
	});
}

// NOTE: Tの制約が思いつくまでは`Parser<any>[]`
// NOTE: resultの型が思いつくまでは`any`
export function sequence<T extends Parser<any>[]>(parsers: [...T]): Parser<InferParserResults<T>> {
	return Parser.create(`seq{${parsers.map(i => i.id).join(',')}}`, (input) => {
		const result: any[] = [];
		let remaining = input;
		let i = 0;
		let task = parsers[i].parse(remaining);
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
			task = parsers[i].parse(remaining);
			//console.log('[seq] next');
		});
	});
}

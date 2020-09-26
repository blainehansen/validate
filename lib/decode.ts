import { Result, Ok, Err, Maybe, Some, None } from '@blainehansen/monads'

import { Dict, Cast, TupleIntersection, FilteredTupleIntersection, TupleLike, isObject } from './utils'

export abstract class Decoder<T> {
	abstract readonly name: string
	abstract decode(input: unknown): Result<T>
	abstract decodeExact(input: unknown): Result<T>
}
export function callIsExact<T>(decoder: Decoder<T>, isExact: boolean, input: unknown): Result<T> {
	return isExact ? decoder.decodeExact(input) : decoder.decode(input)
}

export type DecoderTuple<L extends any[]> = {
	[K in keyof L]: Decoder<L[K]>
}
export type TypeOf<D extends Decoder<any>> = D extends Decoder<infer T> ? T : never

function decoderErr<T>(name: string, input: unknown) {
	return Err(`expected ${name}, got ${input}`)
}

export abstract class SameDecoder<T> extends Decoder<T> {
	abstract readonly name: string
	protected abstract _decode(input: unknown): Result<T>
	decode(input: unknown): Result<T> { return this._decode(input) }
	decodeExact(input: unknown): Result<T> { return this._decode(input) }
}

export abstract class CombinatorDecoder<T> extends Decoder<T> {
	abstract readonly name: string
	protected abstract _decode(input: unknown, isExact: boolean): Result<T>
	decode(input: unknown): Result<T> { return this._decode(input, false) }
	decodeExact(input: unknown): Result<T> { return this._decode(input, true) }
}

class WrapDecoder<T> extends SameDecoder<T> {
	constructor(
		readonly name: string,
		readonly decoderFunc: (input: unknown) => Result<T>,
	) { super() }

	_decode(input: unknown) {
		return this.decoderFunc(input)
	}
}
export function wrap<T>(name: string, decoderFunc: (input: unknown) => Result<T>): Decoder<T> {
	return new WrapDecoder(name, decoderFunc)
}

class EnumDecoder<T> extends SameDecoder<T> {
	constructor(
		readonly name: string,
		readonly decoderFunc: (input: unknown) => T | undefined,
	) { super() }

	_decode(input: unknown): Result<T> {
		const { name, decoderFunc } = this
		const result = decoderFunc(input)
		return result === undefined ? decoderErr(name, input) : Ok(result)
	}
}
export function wrapEnum<T>(name: string, decoderFunc: (input: unknown) => T | undefined): Decoder<T> {
	return new EnumDecoder(name, decoderFunc)
}


type Func<L extends any[], T> = (...args: L) => T
class FunctionDecoder<L extends any[], T> extends CombinatorDecoder<T> {
	readonly name: string
	constructor(readonly fn: Func<L, T>, readonly argsDecoder: Decoder<L>) {
		super()
		this.name = fn.name
	}

	_decode(input: unknown, isExact: boolean): Result<T> {
		const { name, fn, argsDecoder } = this
		const argsResult = callIsExact(argsDecoder, isExact, input)
		return argsResult.isErr()
			? Err(`expected args to call ${name}, got ${input}`)
			: Ok(fn(...argsResult.value))
	}
}
export function func<L extends any[], T>(fn: Func<L, T>, argsDecoder: Decoder<L>): Decoder<T> {
	return new FunctionDecoder(fn, argsDecoder)
}

// type Func<L extends any[], T> = (...args: L) => T
// class FunctionDecoder<L extends any[], T> {
// 	readonly name: string
// 	constructor(readonly fn: Func<L, T>, readonly argsDecoder: Decoder<L>) {
// 		super()
// 		this.name = fn.name
// 	}

// 	callDecode(input: unknown): Result<T> {
// 		const { name, fn, argsDecoder } = this
// 		const argsResult = argsDecoder.decode(input)
// 		return argsResult.isErr()
// 			? Err(`expected args to call ${name}, got ${input}`)
// 			: Ok(fn(...argsResult.value))
// 	}
// }
// export function func<L extends any[], T>(fn: Func<L, T>, argsDecoder: Decoder<L>) {
// 	return new FunctionDecoder(fn, argsDecoder)
// }



export interface Constructable<L extends any[], T> {
	new (...args: L): T
}
class ClassDecoder<L extends any[], T> extends CombinatorDecoder<T> {
	readonly name: string
	constructor(readonly clz: Constructable<L, T>, readonly constructorArgsDecoder: Decoder<L>) {
		super()
		this.name = clz.name
	}

	_decode(input: unknown, isExact: boolean): Result<T> {
		const { name, clz, constructorArgsDecoder } = this
		if (input instanceof clz) return Ok(input)

		const argsResult = callIsExact(constructorArgsDecoder, isExact, input)
		return argsResult.isErr()
			? Err(`expected instance of or args to construct ${name}, got ${input}`)
			: Ok(new clz(...argsResult.value))
	}
}
export function cls<L extends any[], T>(clz: Constructable<L, T>, constructorArgsDecoder: Decoder<L>): Decoder<T> {
	return new ClassDecoder(clz, constructorArgsDecoder)
}


export const unknown = new WrapDecoder(
	'unknown',
	function(input: unknown): Result<unknown> {
		return Ok(input)
	},
)
export const never = new WrapDecoder(
	'never',
	function(input: unknown): Result<never> {
		return Err('never') as Result<never>
	}
)
export const string = new WrapDecoder(
	'string',
	function(input: unknown): Result<string> {
		if (typeof input === 'string') return Ok(input)
		else return Err(`expected string, got ${input}`)
	},
)
export const boolean = new WrapDecoder(
	'boolean',
	function (input: unknown): Result<boolean> {
		if (typeof input === 'boolean') return Ok(input)
		else return Err(`expected boolean, got ${input}`)
	},
)
export const number = new WrapDecoder(
	'number',
	function decode(input: unknown): Result<number> {
		if (
			typeof input === 'number'
			&& input !== Infinity
			&& input !== -Infinity
			&& !isNaN(input)
		) return Ok(input)
		else return Err(`expected number, got ${input}`)
	},
)
export const looseNumber = new WrapDecoder(
	'looseNumber',
	function decode(input: unknown): Result<number> {
		if (typeof input === 'number') return Ok(input)
		else return Err(`expected number, got ${input}`)
	},
)
export const int = new WrapDecoder(
	'int',
	function decode(input: unknown): Result<number> {
		if (
			typeof input === 'number'
			&& input !== Infinity
			&& input !== -Infinity
			&& !isNaN(input)
			&& input % 1 === 0
		) return Ok(input)
		else return Err(`expected int, got ${input}`)
	},
)
export const uint = new WrapDecoder(
	'uint',
	function decode(input: unknown): Result<number> {
		if (
			typeof input === 'number'
			&& input !== Infinity
			&& input !== -Infinity
			&& !isNaN(input)
			&& input % 1 === 0
			&& input >= 0
		) return Ok(input)
		else return Err(`expected uint, got ${input}`)
	},
)


class RecursiveDecoder<T> extends CombinatorDecoder<T> {
	readonly name!: string
	constructor(readonly fn: () => Decoder<T>) { super() }

	_decode(input: unknown, isExact: boolean) {
		const decoder = this.fn()
		if ((this.name as any) === undefined)
			(this.name as any) = decoder.name

		return callIsExact(decoder, isExact, input)
	}
}
export function recursive<T>(fn: () => Decoder<T>): Decoder<T> {
	return new RecursiveDecoder(fn)
}


class MaybeDecoder<T> extends CombinatorDecoder<Maybe<T>> {
	readonly name: string
	constructor(readonly decoder: Decoder<T>) {
		super()
		this.name = `Maybe<${decoder.name}>`
	}
	_decode(input: unknown, isExact: boolean): Result<Maybe<T>> {
		if (input === null || input === undefined)
			return Ok(None)
		// if (Maybe.isMaybe(input))
		// 	return input.match({
		// 		some: value => this.decoder
		// 			.decode(value)
		// 			.change(value => Some(value)),
		// 		none: () => Ok(None),
		// 	})
		const { name, decoder } = this
		return callIsExact(decoder, isExact, input)
			.change(value => Some(value))
			.changeErr(err => `expected ${name}, encountered this error: ${err}`)
	}
}
export function maybe<T>(decoder: Decoder<T>): Decoder<Maybe<T>> {
	return new MaybeDecoder<T>(decoder)
}


class UnionDecoder<L extends any[]> extends CombinatorDecoder<L[number]> {
	readonly name: string
	readonly decoders: DecoderTuple<L>
	constructor(decoders: DecoderTuple<L>) {
		super()
		const flattened = [] as unknown as DecoderTuple<L>
		for (const decoder of decoders) {
			if (decoder instanceof UnionDecoder)
				Array.prototype.push.apply(flattened, decoder.decoders as unknown as any[])
			else
				flattened.push(decoder)
		}
		this.name = flattened.map(d => d.name).join(' | ')
		this.decoders = flattened
	}

	_decode(input: unknown, isExact: boolean) {
		for (const decoder of this.decoders) {
			const result = callIsExact(decoder, isExact, input)
			if (result.isOk()) return result
		}

		return Err(`expected ${this.name}; got ${input}`)
	}
}
export function union<L extends any[]>(...decoders: DecoderTuple<L>): Decoder<L[number]> {
	return new UnionDecoder<L>(decoders)
}


type Primitives = string | boolean | number | bigint | null | undefined | void
class ValuesDecoder<V extends Primitives, L extends V[]> extends SameDecoder<L[number]> {
	readonly name: string
	constructor(readonly values: L) {
		super()
		this.name = values.map(v => `${v}`).join(' | ')
	}

	_decode(input: unknown): Result<L[number]> {
		for (const value of this.values)
			if (value === input) return Ok(value)

		return Err(`expected ${this.name}; got ${input}`)
	}
}
export function literal<V extends Primitives>(value: V): Decoder<V> {
	return new ValuesDecoder([value] as [V])
}
export function literals<L extends Primitives[]>(...values: L): Decoder<L[number]> {
	return new ValuesDecoder(values)
}

export function undefinable<T>(decoder: Decoder<T>): Decoder<T | undefined> {
	return new UnionDecoder([decoder, undefinedLiteral] as [Decoder<T>, Decoder<undefined>])
}
export function nullable<T>(decoder: Decoder<T>): Decoder<T | null> {
	return new UnionDecoder([decoder, nullLiteral] as [Decoder<T>, Decoder<null>])
}
export function nillable<T>(decoder: Decoder<T>): Decoder<T | null | undefined> {
	return new UnionDecoder([decoder, nullLiteral, undefinedLiteral] as [Decoder<T>, Decoder<null>, Decoder<undefined>])
}

export const undefinedLiteral = literal(undefined as undefined)
export const nullLiteral = literal(null as null)
export const voidLiteral = literal(undefined as void)
export const trueLiteral = literal(true as true)
export const falseLiteral = literal(false as false)


class OptionalDecoder<T> extends CombinatorDecoder<T | undefined> {
	readonly name: string
	readonly decoder: Decoder<T>
	constructor(decoder: Decoder<T>) {
		super()
		this.name = `(${decoder.name})?`
		this.decoder = decoder instanceof UnionDecoder
			? new UnionDecoder((decoder as UnionDecoder<unknown[]>).decoders.filter(decoder => decoder !== undefinedLiteral)) as Decoder<T>
			: decoder
	}

	_decode(input: unknown, isExact: boolean): Result<T | undefined> {
		if (input === undefined) return Ok(undefined)
		return callIsExact(this.decoder, isExact, input)
	}
}
export function optional<T>(decoder: Decoder<T>): Decoder<T | undefined> {
	return new OptionalDecoder(decoder)
}


class ArrayDecoder<T> extends CombinatorDecoder<T[]> {
	readonly name: string
	constructor(readonly decoder: Decoder<T>) {
		super()
		this.name = `${decoder.name}[]`
	}

	_decode(input: unknown, isExact: boolean): Result<T[]> {
		const { name, decoder } = this

		if (!Array.isArray(input)) return decoderErr(name, input)

		for (let index = 0; index < input.length; index++) {
			const item = input[index]
			const result = callIsExact(decoder, isExact, item)
			if (result.isErr())
				return Err(`while decoding ${name}: at index ${index}, failed to decode ${decoder.name}: ${result.error}`)
		}

		return Ok(input)
	}
}
export function array<T>(decoder: Decoder<T>): Decoder<T[]> {
	return new ArrayDecoder(decoder)
}


class DictionaryDecoder<T> extends CombinatorDecoder<Dict<T>> {
	readonly name: string
	constructor(readonly decoder: Decoder<T>) {
		super()
		this.name = `Dict<${decoder.name}>`
	}

	_decode(input: unknown, isExact: boolean): Result<Dict<T>> {
		const { name, decoder } = this

		if (!isObject(input) || Array.isArray(input)) return decoderErr(name, input)

		for (const key in input) {
			const value = (input as any)[key]
			const result = callIsExact(decoder, isExact, value)
			if (result.isErr())
				return Err(`while decoding ${name}, at key ${key}, failed to decode ${decoder.name}: ${result.error}`)
		}

		return Ok(input as Dict<T>)
	}
}
export function dictionary<T>(decoder: Decoder<T>): Decoder<Dict<T>> {
	return new DictionaryDecoder(decoder)
}


class RecordDecoder<K extends string | number | symbol, T> extends CombinatorDecoder<Record<K, T>> {
	readonly name: string
	constructor(readonly keys: K[], readonly decoder: Decoder<T>) {
		super()
		this.name = `Record<${keys.map(key => typeof key === 'string' ? `"${key}"` : key).join(' | ')}, ${decoder.name}>`
	}

	_decode(input: unknown, isExact: boolean): Result<Record<K, T>> {
		const { name, keys, decoder } = this
		if (!isObject(input)) return decoderErr(name, input)

		for (const key of keys) {
			const value = (input as any)[key]
			const result = callIsExact(decoder, isExact, value)
			if (result.isErr()) return Err(`in ${name}, invalid key ${key}, got ${value}, error: ${result.error}`)
		}

		return Ok(input as Record<K, T>)
	}
}
export function record<K extends string | number | symbol, T>(keys: K[], decoder: Decoder<T>): Decoder<Record<K, T>> {
	return new RecordDecoder(keys, decoder)
}


class TupleDecoder<L extends any[], S extends any[] = []> extends CombinatorDecoder<[...L, ...S]> {
	readonly name: string
	readonly minLength: number
	constructor(readonly decoders: DecoderTuple<L>, readonly spread: Decoder<S> | undefined) {
		super()
		const spreadSection = spread ? `, ...${spread.name}` : ''
		this.name = `[${decoders.map(d => d.name).join(', ')}${spreadSection}]`
		let index = decoders.length - 1
		while (index >= 0) {
			const decoder = decoders[index]
			index--
			if (!(decoder instanceof OptionalDecoder)) break
		}
		this.minLength = index + 1
	}

	_decode(input: unknown, isExact: boolean): Result<[...L, ...S]> {
		const { name, decoders, spread, minLength } = this

		if (
			!Array.isArray(input)
			|| input.length < minLength
			|| (!spread && input.length > decoders.length)
		) return decoderErr(name, input)

		for (let index = 0; index < decoders.length; index++) {
			const decoder = decoders[index]
			const value = input[index]
			const result = callIsExact(decoder, isExact, value)
			if (result.isErr())
				return Err(`while decoding ${name}, at index ${index}, failed to decode ${decoder.name}: ${result.error}`)
		}

		if (spread) {
			const rest = input.slice(decoders.length)
			const result = callIsExact(spread, isExact, rest)
			if (result.isErr())
				return Err(`while decoding ${name}, in the spread, failed to decode ${spread.name}: ${result.error}`)
		}

		return Ok(input as [...L, ...S])
	}
}
export function tuple<L extends any[]>(...decoders: DecoderTuple<L>): Decoder<L> {
	return new TupleDecoder<L, []>(decoders, undefined)
}
export function spread<L extends any[], S extends any[]>(
	...args: [...DecoderTuple<L>, Decoder<S>]
): Decoder<[...L, ...S]> {
	const decoders = args.slice(0, args.length - 1) as DecoderTuple<L>
	const spread = args[args.length - 1] as Decoder<S>
	return new TupleDecoder<L, S>(decoders, spread)
}


type DecoderObject<O extends Dict<any>> = { [K in keyof O]: Decoder<O[K]> }
class ObjectDecoder<O extends Dict<any>> extends CombinatorDecoder<O> {
	readonly name: string
	readonly decoders: DecoderObject<O>
	constructor(args: [string, DecoderObject<O>] | [DecoderObject<O>]) {
		super()
		if (args.length === 2) {
			const [name, decoders] = args
			this.name = name
			this.decoders = decoders
		}
		else {
			const [decoders] = args
			const pairs = Object.entries(decoders).map(([key, value]) => `${key}: ${value.name}`)
			const name = pairs.length < 5
				? `{ ${pairs.join(', ')} }`
				: `{\n\t${pairs.join(',\n\t')}\n}`

			this.name = name
			this.decoders = decoders
		}
	}

	_decode(input: unknown, isExact: boolean): Result<O> {
		const { name, decoders } = this
		if (!isObject(input)) return Err(`Failed to decode a valid ${name}, input is not an object: ${input}`)

		for (const key in decoders) {
			const decoder = decoders[key]
			const value = (input as any)[key]
			const result = callIsExact(decoder, isExact, value)
			if (result.isErr()) return Err(`Failed to decode a valid ${name}, key ${key} has invalid value: ${value}`)
		}
		if (!isExact)
			return Ok(input as O)

		for (const key in input)
			if (!(key in decoders)) return Err(`Failed to decode a valid ${name}, input had invalid extra key ${key}`)
		return Ok(input as O)
	}
}
export function object<O extends Dict<any>>(
	...args: [string, DecoderObject<O>] | [DecoderObject<O>]
): Decoder<O> {
	return new ObjectDecoder(args)
}


type UnknownObjectDecoder = ObjectDecoder<Dict<unknown>>
type UnknownArrayDecoder = ArrayDecoder<unknown>
type UnknownUnionDecoder = UnionDecoder<unknown[]>

class IntersectionDecoder<L extends any[]> extends CombinatorDecoder<TupleIntersection<L>> {
	readonly name: string
	constructor(readonly decoders: DecoderTuple<L>) {
		super()
		this.name = decoders.map(decoder => decoder.name).join(' & ')
	}

	_decode(input: unknown, isExact: boolean): Result<TupleIntersection<L>> {
		const { name, decoders } = this
		for (const decoder of this.decoders) {
			const result = callIsExact(decoder, isExact, input)
			if (result.isErr()) return Err(`expected ${name}, got ${input}: ${result.error}`)
		}
		return Ok(input as TupleIntersection<L>)
	}
}
export function intersection<L extends any[]>(...decoders: DecoderTuple<L>): Decoder<TupleIntersection<L>> {
	const objectDecoders = [] as UnknownObjectDecoder[]
	const arrayDecoders = [] as UnknownArrayDecoder[]
	const unionDecoders = [] as UnknownUnionDecoder[]
	const otherDecoders = [] as Decoder<unknown>[]

	const decodersQueue = decoders.slice()
	let decoder
	while (decoder = decodersQueue.shift()) {
		if (decoder instanceof ObjectDecoder) objectDecoders.push(decoder)
		else if (decoder instanceof ArrayDecoder) arrayDecoders.push(decoder)
		else if (decoder instanceof UnionDecoder) unionDecoders.push(decoder)
		else if (decoder instanceof IntersectionDecoder)
			Array.prototype.push.apply(decodersQueue, decoder.decoders as unknown as Decoder<unknown>[])
		else otherDecoders.push(decoder)
	}

	if (unionDecoders.length) {
		const finalUnionDecoders = [] as Decoder<unknown>[]
		const [unionDecoder, ...rest] = unionDecoders
		for (const decoder of unionDecoder.decoders) {
			finalUnionDecoders.push(intersection(
				decoder,
				...rest, ...objectDecoders, ...arrayDecoders, ...otherDecoders,
			))
		}
		return new UnionDecoder(finalUnionDecoders) as Decoder<TupleIntersection<L>>
	}

	const finalDecoders = otherDecoders as unknown as DecoderTuple<L>
	if (objectDecoders.length) {
		const objectKeyDecoders = {} as Dict<Decoder<unknown>[]>
		for (const objectDecoder of objectDecoders)
			for (const key in objectDecoder.decoders)
				(objectKeyDecoders[key] || (objectKeyDecoders[key] = [])).push(objectDecoder.decoders[key])

		const finalKeyDecoders = {} as DecoderObject<Dict<unknown>>
		for (const key in objectKeyDecoders) {
			const keyDecoders = objectKeyDecoders[key]
			finalKeyDecoders[key] = keyDecoders.length === 1 ? keyDecoders[0] : intersection(...keyDecoders)
		}
		finalDecoders.push(new ObjectDecoder([finalKeyDecoders]))
	}

	if (arrayDecoders.length) {
		const arrayDecoder = arrayDecoders.length === 1
			? arrayDecoders[0]
			: new ArrayDecoder(intersection(...arrayDecoders.map(arrayDecoder => arrayDecoder.decoder)))
		finalDecoders.push(arrayDecoder)
	}

	return new IntersectionDecoder<L>(finalDecoders)
}


export function partial<T>(decoder: Decoder<T>): Decoder<Partial<T>> {
	if (decoder instanceof ObjectDecoder) {
		const finalKeyDecoders = {} as DecoderObject<Partial<T>>
		for (const key in decoder.decoders) {
			const keyDecoder = decoder.decoders[key]
			finalKeyDecoders[key as keyof DecoderObject<Partial<T>>] = partialWrapOptional(keyDecoder)
		}
		return new ObjectDecoder([finalKeyDecoders])
	}

	if (decoder instanceof ArrayDecoder)
		return decoder.decoder instanceof OptionalDecoder
			? decoder
			: new ArrayDecoder(new OptionalDecoder(decoder.decoder)) as unknown as Decoder<Partial<T>>

	if (decoder instanceof TupleDecoder) {
		const finalIndexDecoders = (decoder.decoders as unknown as Decoder<any>[]).map(partialWrapOptional)
		return new TupleDecoder(
			finalIndexDecoders,
			decoder.spread ? partial(decoder.spread) as Decoder<any[]> : undefined,
		) as unknown as Decoder<Partial<T>>
	}

	if (decoder instanceof DictionaryDecoder)
		return decoder.decoder instanceof OptionalDecoder
			? decoder
			: new DictionaryDecoder(new OptionalDecoder(decoder.decoder)) as unknown as Decoder<Partial<T>>

	if (decoder instanceof UnionDecoder)
		return new UnionDecoder((decoder.decoders as unknown as Decoder<any>[]).map(partial))

	if (decoder instanceof IntersectionDecoder)
		return new IntersectionDecoder((decoder.decoders as unknown as Decoder<any>[]).map(partial))

	// if (decoder instanceof ClassDecoder)
	return decoder
}
function partialWrapOptional<T>(decoder: Decoder<T>): Decoder<T | undefined> {
	return decoder instanceof OptionalDecoder ? decoder : new OptionalDecoder(decoder)
}


export function required<T>(decoder: Decoder<T>): Decoder<Required<T>> {
	if (decoder instanceof ObjectDecoder) {
		const finalKeyDecoders = {} as DecoderObject<Required<T>>
		for (const key in decoder.decoders) {
			const keyDecoder = decoder.decoders[key]
			finalKeyDecoders[key as keyof DecoderObject<Required<T>>] = requiredUnwrapOptional(keyDecoder)
		}
		return new ObjectDecoder([finalKeyDecoders])
	}

	if (decoder instanceof ArrayDecoder)
		return new ArrayDecoder(requiredUnwrapUndefinable(decoder.decoder)) as unknown as Decoder<Required<T>>

	if (decoder instanceof TupleDecoder) {
		const finalIndexDecoders = (decoder.decoders as unknown as Decoder<any>[]).map(requiredUnwrapOptional)
		return new TupleDecoder(
			finalIndexDecoders,
			decoder.spread ? required(decoder.spread) as Decoder<any[]> : undefined,
		) as unknown as Decoder<Required<T>>
	}

	// if (decoder instanceof DictionaryDecoder)
	// 	return new DictionaryDecoder(required(decoder.decoder)) as unknown as Decoder<Required<T>>

	if (decoder instanceof UnionDecoder)
		return new UnionDecoder((decoder.decoders as unknown as Decoder<any>[]).map(required)) as unknown as Decoder<Required<T>>

	if (decoder instanceof IntersectionDecoder)
		return new IntersectionDecoder((decoder.decoders as unknown as Decoder<any>[]).map(required)) as unknown as Decoder<Required<T>>

	// if (decoder instanceof ClassDecoder)
	return decoder as Decoder<Required<T>>
}
function requiredUnwrapOptional<T>(decoder: Decoder<T | undefined>): Decoder<T> {
	return decoder instanceof OptionalDecoder ? decoder.decoder : decoder
}
function requiredUnwrapUndefinable<T>(initial: Decoder<T | undefined>): Decoder<T> {
	const decoder = requiredUnwrapOptional(initial)
	if (decoder instanceof UnionDecoder) {
		const finalDecoders = (decoder as UnionDecoder<unknown[]>).decoders
			.filter(decoder => decoder !== undefinedLiteral)

		return finalDecoders.length === 1
			? finalDecoders[0] as Decoder<T>
			: new UnionDecoder(finalDecoders) as Decoder<T>
	}
	if (decoder instanceof ValuesDecoder)
		return new ValuesDecoder(decoder.values.filter((value: Primitives) => value !== undefined))

	return decoder
}


export function nonnullable<T>(decoder: Decoder<T>): Decoder<NonNullable<T>> {
	if (decoder instanceof OptionalDecoder)
		return nonnullable(decoder.decoder)
	if (decoder instanceof ValuesDecoder)
		return new ValuesDecoder(decoder.values.filter((value: Primitives) => value !== null && value !== undefined)) as Decoder<NonNullable<T>>

	if (decoder instanceof UnionDecoder) {
		const finalDecoders = (decoder as UnionDecoder<unknown[]>).decoders
			.filter(decoder => decoder !== undefinedLiteral && decoder !== nullLiteral)

		return finalDecoders.length === 1
			? finalDecoders[0] as unknown as Decoder<NonNullable<T>>
			: new UnionDecoder(finalDecoders) as Decoder<NonNullable<T>>
	}

	return decoder as Decoder<NonNullable<T>>
}

// function unwrapDecoders(decoder: UnionDecoder) {
// 	//
// }

export function readonly<T>(decoder: Decoder<T>): Decoder<Readonly<T>> {
	return decoder
}


export function pick<T, K extends keyof T>(decoder: Decoder<T>, keys: K[]): Decoder<Pick<T, K>> {
	// it's absurd to try to replicate the behavior of Pick in a spread tuple
	if (decoder instanceof ObjectDecoder || decoder instanceof TupleDecoder) {
		const finalKeyDecoders = {} as DecoderObject<Pick<T, K>>
		for (const key of keys)
			finalKeyDecoders[key] = decoder.decoders[key]
		return new ObjectDecoder([finalKeyDecoders])
	}

	return decoder
}

export function omit<T, K extends keyof T>(decoder: Decoder<T>, keys: K[]): Decoder<Omit<T, K>> {
	if (decoder instanceof ObjectDecoder || decoder instanceof TupleDecoder) {
		const finalKeyDecoders = {} as DecoderObject<Omit<T, K>>
		for (const key in decoder.decoders) {
			if (keys.includes(key as K)) continue
			finalKeyDecoders[key as keyof DecoderObject<Omit<T, K>>] = decoder.decoders[key]
		}
		return new ObjectDecoder([finalKeyDecoders])
	}

	return decoder
}


export * from './adapt'

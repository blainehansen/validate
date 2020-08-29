import { TupleIntersection } from './utils'
import { Result, Ok, Err, Maybe, Some, None } from '@blainehansen/monads'

export abstract class Decoder<T> {
	abstract readonly name: string
	abstract decode(input: unknown): Result<T>

	guard(input: unknown): input is T {
		return this.decode(input).isOk()
	}
}

export type TypeOf<D extends Decoder<unknown>> = D extends Decoder<infer T> ? T : never

type SafeAdaptor<U, T> = { isFallible: false, decoder: Decoder<U>, func: (input: U) => T }
type FallibleAdaptor<U, T> = { isFallible: true, decoder: Decoder<U>, func: (input: U) => Result<T> }

type Adaptor<U, T> =
	| SafeAdaptor<U, T>
	| FallibleAdaptor<U, T>

type AdaptorTuple<L extends any[], T> = {
	[K in keyof L]: Adaptor<L[K], T>
}

class AdaptorDecoder<U, T> extends Decoder<T> {
	readonly name: string
	constructor(
		readonly decoder: Decoder<T>,
		readonly adaptors: Adaptor<U, T>[],
	) {
		super()
		this.name = `adaptable ${decoder.name}`
	}

	decode(input: unknown): Result<T> {
		const baseAttempt = this.decoder.decode(input)
		if (baseAttempt.isOk())
			return baseAttempt

		for (const adaptor of this.adaptors) {
			const adaptorResult = adaptor.decoder.decode(input)
			const adaptorAttempt = adaptor.isFallible
				? adaptorResult.tryChange(adaptor.func)
				: adaptorResult.change(adaptor.func)

			if (adaptorAttempt.isOk())
				return adaptorAttempt
		}

		const names = this.adaptors.map(a => a.decoder.name).join(', ')
		return Err(`in ${this.name}, couldn't decode from any of [${names}]; got ${input}`)
	}
}

export function adapt<L extends any[], T>(
	decoder: Decoder<T>,
	...adaptors: AdaptorTuple<L, T>
): Decoder<T> {
	return new AdaptorDecoder(decoder, adaptors) as Decoder<T>
}

export function adaptor<U, T>(decoder: Decoder<U>, func: (input: U) => T): SafeAdaptor<U, T> {
	return { isFallible: false, decoder, func }
}

export function tryAdaptor<U, T>(decoder: Decoder<U>, func: (input: U) => Result<T>): FallibleAdaptor<U, T> {
	return { isFallible: true, decoder, func }
}

export type DecoderTuple<L extends unknown[]> = {
	[K in keyof L]: Decoder<L[K]>
}


function isObject(input: unknown): input is NonNullable<Object> {
	return typeof input === 'object' && input !== null && !Array.isArray(input)
}


export interface CodecConstructor<L extends unknown[], T extends Codec<L>> {
	new (...args: L): T
	decode: Decoder<L>
}

export interface Codec<L extends unknown[] = unknown[]> {
	encode(): L
}


// export interface ErrorLike {
// 	message: string
// }

// export abstract class Serializer<E extends ErrorLike = Error> {
// 	// serializeCodec<D extends Codec>(output: D): string {
// 	// }
// 	serialize(output: any): string {
// 		if ('encode' in output && typeof output.encode === 'function')
// 			return this.serialize(output.encode())
// 	}
// 	abstract serialize(output: any): string
// 	abstract deserialize(input: string): Result<unknown, E>
// 	decode<T>(input: string, decoder: Decoder<T>): Result<T> {
// 		return this.deserialize(input)
// 			.changeErr(e => e.message)
// 			.tryChange(input => decoder.decode(input))
// 	}
// }

// export class JsonSerializer extends Serializer {
// 	serializeAny<D extends Codec>(output: D): string {
// 		return JSON.stringify(output.encode())
// 	}
// 	deserialize(input: string): Result<unknown, Error> {
// 		return Result.attempt(() => JSON.parse(input))
// 	}
// }


class ClassDecoder<L extends unknown[], T extends Codec<L>> extends Decoder<T> {
	readonly name: string
	constructor(readonly cn: CodecConstructor<L, T>) {
		super()
		this.name = cn.name
	}

	decode(input: unknown) {
		if (input instanceof this.cn) return Ok(input)
		return this.cn.decode.decode(input)
			.changeErr(e => `while decoding class ${this.name}: ${e}`)
			.change(args => new this.cn(...args))
	}
}
export function cls<L extends unknown[], T extends Codec<L>>(cn: CodecConstructor<L, T>): Decoder<T> {
	return new ClassDecoder(cn) as Decoder<T>
}


class WrapDecoder<T> extends Decoder<T> {
	constructor(
		readonly name: string,
		readonly decoderFunc: (input: unknown) => Result<T>,
	) {
		super()
	}

	decode(input: unknown) {
		return this.decoderFunc(input)
	}
}
export function wrap<T>(name: string, decoderFunc: (input: unknown) => Result<T>): Decoder<T> {
	return new WrapDecoder(name, decoderFunc) as Decoder<T>
}


// export const always = new WrapDecoder(
// 	'always',
// 	function(input: unknown): Result<unknown> {
// 		return Ok(input)
// 	},
// )

// export const never = new WrapDecoder(
// 	'never',
// 	function(input: unknown): Result<never> {
// 		return Err('never')
// 	}
// )

export const string = new WrapDecoder(
	'string',
	function(input: unknown): Result<string> {
		if (typeof input === 'string') return Ok(input)
		else return Err(`expected string, got ${input}`)
	},
) as Decoder<string>

export const boolean = new WrapDecoder(
	'boolean',
	function (input: unknown): Result<boolean> {
		if (typeof input === 'boolean') return Ok(input)
		else return Err(`expected boolean, got ${input}`)
	},
) as Decoder<boolean>

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
) as Decoder<number>
export const looseNumber = new WrapDecoder(
	'looseNumber',
	function decode(input: unknown): Result<number> {
		if (typeof input === 'number') return Ok(input)
		else return Err(`expected number, got ${input}`)
	},
) as Decoder<number>
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
) as Decoder<number>
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
) as Decoder<number>


class RecursiveDecoder<T> extends Decoder<T> {
	readonly name!: string
	constructor(readonly fn: () => Decoder<T>) { super() }

	decode(input: unknown) {
		const decoder = this.fn()
		if ((this.name as any) === undefined)
			(this.name as any) = decoder.name

		return decoder.decode(input)
	}
}
export function recursive<T>(fn: () => Decoder<T>) {
	return new RecursiveDecoder(fn)
}


class UnionDecoder<L extends unknown[]> extends Decoder<L[number]> {
	readonly name: string
	constructor(readonly decoders: DecoderTuple<L>) {
		super()
		this.name = decoders.map(d => d.name).join(' | ')
	}

	decode(input: unknown) {
		for (const decoder of this.decoders) {
			const result = decoder.decode(input)
			if (result.isOk()) return result
		}

		return Err(`expected ${this.name}; got ${input}`)
	}
}
export function union<L extends unknown[], LO extends unknown[]>(...decoders: DecoderTuple<L>): Decoder<L[number]> {
	const flattened = [] as unknown as DecoderTuple<LO>
	for (const decoder of decoders) {
		if (decoder instanceof UnionDecoder)
			Array.prototype.push.apply(flattened, decoder.decoders as unknown as any[])
		else
			flattened.push(decoder)
	}
	return new UnionDecoder(flattened as DecoderTuple<LO>) as Decoder<L[number]>
}


type Primitives = string | boolean | number | null | undefined

class ValuesDecoder<V extends Primitives, L extends V[]> extends Decoder<L[number]> {
	readonly name: string
	constructor(readonly values: L) {
		super()
		this.name = values.map(v => `${v}`).join(' | ')
	}

	decode(input: unknown): Result<L[number]> {
		for (const value of this.values) {
			if (value === input) return Ok(value)
		}

		return Err(`expected ${this.name}; got ${input}`)
	}
}
export function literal<V extends Primitives>(value: V): Decoder<V> {
	return new ValuesDecoder([value]) as Decoder<V>
}
export function literals<V extends Primitives, L extends V[]>(...values: L): Decoder<L[number]> {
	return new ValuesDecoder(values) as Decoder<L[number]>
}


export const undefinedLiteral = literal(undefined as undefined)
export const nullLiteral = literal(null as null)

export function optional<T>(decoder: Decoder<T>): Decoder<T | undefined> {
	return new UnionDecoder([decoder, undefinedLiteral]) as Decoder<T | undefined>
}
export function nullable<T>(decoder: Decoder<T>): Decoder<T | null> {
	return new UnionDecoder([decoder, nullLiteral]) as Decoder<T | null>
}
export function nillable<T>(decoder: Decoder<T>): Decoder<T | null | undefined> {
	return new UnionDecoder([decoder, nullLiteral, undefinedLiteral]) as Decoder<T | null | undefined>
}

class MaybeDecoder<T> extends Decoder<Maybe<T>> {
	readonly name: string
	constructor(readonly decoder: Decoder<T>) {
		super()
		this.name = `Maybe<${decoder.name}>`
	}
	decode(input: unknown): Result<Maybe<T>> {
		if (input === null || input === undefined)
			return Ok(None)
		// if (Maybe.isMaybe(input))
		// 	return input.match({
		// 		some: value => this.decoder
		// 			.decode(value)
		// 			.change(value => Some(value)),
		// 		none: () => Ok(None),
		// 	})
		return this.decoder
			.decode(input)
			.change(value => Some(value))
			.changeErr(err => `expected ${this.name}, encountered this error: ${err}`)
	}
}
export function maybe<T>(decoder: Decoder<T>): Decoder<Maybe<T>> {
	return new MaybeDecoder<T>(decoder) as Decoder<Maybe<T>>
}


function decoderErr<T>(decoder: Decoder<T>, input: unknown) {
	return Err(`expected ${decoder.name}, got ${input}`)
}

class ArrayDecoder<T> extends Decoder<T[]> {
	readonly name: string
	constructor(readonly decoder: Decoder<T>) {
		super()
		this.name = `${decoder.name}[]`
	}

	decode(input: unknown): Result<T[]> {
		const { name, decoder } = this

		if (!Array.isArray(input)) return decoderErr(this, input)

		const give: T[] = []
		for (let index = 0; index < input.length; index++) {
			const item = input[index]
			const result = decoder.decode(item)
			if (result.isErr())
				return Err(`while decoding ${name}: at index ${index}, failed to decode ${decoder.name}: ${result.error}`)

			give.push(result.value)
		}

		return Ok(give)
	}
}
export function array<T>(decoder: Decoder<T>): Decoder<T[]> {
	return new ArrayDecoder(decoder) as Decoder<T[]>
}


export type Dict<T> = { [key: string]: T }
class DictionaryDecoder<T> extends Decoder<Dict<T>> {
	readonly name: string
	constructor(readonly decoder: Decoder<T>) {
		super()
		this.name = `Dict<${decoder.name}>`
	}

	decode(input: unknown): Result<Dict<T>> {
		const { name, decoder } = this

		if (!isObject(input)) return Err(`expecting ${name}, got ${input}`)

		// const give = inPlace
		// 	? input
		// 	: {} as Dict<T>
		const give = {} as Dict<T>

		for (const key in input) {
			const value = (input as any)[key]
			const result = decoder.decode(value)
			if (result.isErr())
				return Err(`while decoding ${name}, at key ${key}, failed to decode ${decoder.name}: ${result.error}`)

			give[key] = result.value
		}

		return Ok(give)
	}
}
export function dictionary<T>(decoder: Decoder<T>): Decoder<Dict<T>> {
	return new DictionaryDecoder(decoder) as Decoder<Dict<T>>
}

// class DictTransformer<T> implements Transformer<Dict<T>> {
// 	readonly name: string
// 	constructor(readonly transformer: Transformer<T>) {
// 		this.name = `Dict<${transformer.name}>`
// 	}
// 	decode(dict: Dict<unknown>): Dict<T> {
// 		const give = {} as Dict<T>
// 		for (const key in dict) {
// 			give = this.transformer.transform(dict[key])
// 		}
// 		return give
// 	}
// }
// export function transformDictionary<T>(transformer: Transformer<T>): Transformer<Dict<T>> {
// 	return new DictTransformer(transformer) as Transformer<Dict<T>>
// }


class TupleDecoder<L extends unknown[]> extends Decoder<L> {
	readonly name: string
	constructor(readonly decoders: DecoderTuple<L>) {
		super()
		this.name = `[${decoders.map(d => d.name).join(', ')}]`
	}

	decode(input: unknown): Result<L> {
		const { name, decoders } = this

		if (
			!Array.isArray(input)
			|| input.length !== decoders.length
		) return Err(`expected ${name}, got ${input}`)

		const t = [] as unknown as L
		for (let index = 0; index < decoders.length; index++) {
			const decoder = decoders[index]
			const value = input[index]
			const result = decoder.decode(value)
			if (result.isErr())
				return Err(`while decoding ${name}, at index ${index}, failed to decode ${decoder.name}: ${result.error}`)

			t.push(result.value)
		}

		return Ok(t)
	}
}
export function tuple<L extends unknown[]>(...decoders: DecoderTuple<L>): Decoder<L> {
	return new TupleDecoder(decoders) as Decoder<L>
}



type DecoderObject<O extends Dict<any>> = { [K in keyof O]: Decoder<O[K]> }

abstract class ObjectDecoder<O extends Dict<any>> extends Decoder<O> {
	abstract readonly decoders: DecoderObject<O>
}
// type ObjectDecoderTuple<L extends { [key: string]: unknown }[]> = {
// 	[K in keyof L]: ObjectDecoder<L[K]>
// }

// type ObjectDecoderOrIntersection = (ObjectDecoder<{ [key: string]: unknown }> | IntersectionDecoder<{ [key: string]: unknown }[]>)[]
// type ObjectDecoderTupleFromComplex<L extends ObjectDecoderOrIntersection> = {
// 	[K in keyof L]: L[K] extends ObjectDecoder<infer O>
// 		? ObjectDecoder<O>
// 		: L[K] extends IntersectionDecoder<infer T>
// 		? ObjectDecoder<TupleIntersection<T>>
// 		: never
// }

// type ComplexObjectDecoder<L extends ObjectDecoderOrIntersection> = {
// 	[K in keyof L]: L[K] extends ObjectDecoder<infer O>
// 		? O
// 		: L[K] extends IntersectionDecoder<infer T>
// 		? T
// 		: never
// }

// class IntersectionDecoder<L extends { [key: string]: unknown }[]> extends Decoder<TupleIntersection<L>> {
// 	readonly name: string
// 	constructor(readonly decoders: ObjectDecoderTuple<L>) {
// 		super()
// 		this.name = decoders.map(d => d.name).join(' & ')
// 	}

// 	decode(input: unknown) {
// 		let give = {} as TupleIntersection<L>

// 		for (const { decoders } of this.decoders) {
// 			for (const key in decoders) {
// 				const nestedDecoder = decoders[key]
// 				const result = nestedDecoder.decode(input)
// 				if (result.isErr())
// 					return Err(`in ${this.name}, while decoding ${this.name}: ${result.error}`)
// 				give[key] = result.value
// 			}
// 		}

// 		return Ok(give as TupleIntersection<L>)
// 	}
// }
// export function intersection<L extends ObjectDecoderOrIntersection>(
// 	...decoders: L
// ) {
// 	const flattened = [] as unknown as ObjectDecoderTupleFromComplex<L>
// 	for (const decoder of decoders) {
// 		if (decoder instanceof IntersectionDecoder)
// 			Array.prototype.push.apply(flattened, decoder.decoders as any as any[])
// 		else
// 			flattened.push(decoder)
// 	}
// 	return new IntersectionDecoder(flattened)
// }


class StrictObjectDecoder<O extends Dict<any>> extends ObjectDecoder<O> {
	constructor(
		readonly name: string,
		readonly decoders: DecoderObject<O>,
	) {
		super()
	}

	decode(input: unknown): Result<O> {
		const { name, decoders } = this

		if (!isObject(input)) return Err(`Failed to decode a valid ${name}, input is not an object: ${input}`)

		for (const key in input) {
			if (!(key in decoders)) return Err(`Failed to decode a valid ${name}, input had invalid extra key ${key}`)
		}
		const give = {} as O
		for (const key in decoders) {
			const decoder = decoders[key]
			const value = (input as any)[key]
			const result = decoder.decode(value)
			if (result.isErr()) return Err(`Failed to decode a valid ${name}, key ${key} has invalid value: ${value}`)
			give[key as keyof O] = result.value
		}

		return Ok(give)
	}
}


function objectNameBuilder<O extends Dict<any>>(
	args: [string, DecoderObject<O>] | [DecoderObject<O>]
): [string, DecoderObject<O>] {
	if (args.length === 2) return args

	const [decoders] = args
	const pairs = Object.entries(decoders).map(([key, value]) => `${key}: ${value.name}`)
	const name = pairs.length < 5
		? `{ ${pairs.join(', ')} }`
		: `{\n\t${pairs.join(',\n\t')}\n}`

	return [name, decoders]
}

export function object<O extends Dict<any>>(
	...args: [string, DecoderObject<O>] | [DecoderObject<O>]
): Decoder<O> {
	const [name, decoders] = objectNameBuilder(args)
	return new StrictObjectDecoder(name, decoders)
}


class LooseObjectDecoder<O extends Dict<any>> extends ObjectDecoder<O> {
	constructor(
		readonly name: string,
		readonly decoders: DecoderObject<O>,
	) {
		super()
	}

	decode(input: unknown): Result<O> {
		const { name, decoders } = this

		if (!isObject(input)) return Err(`Failed to decode a valid ${name}, input is not an object: ${input}`)

		const give = { ...input } as O
		for (const key in decoders) {
			const decoder = decoders[key]
			const value = give[key]
			const result = decoder.decode(value)
			if (result.isErr()) return Err(`Failed to decode a valid ${name}, key ${key} has invalid value: ${value}`)
			give[key as keyof O] = result.value
		}

		return Ok(give as O)
	}
}
export function looseObject<O extends Dict<any>>(
	...args: [string, DecoderObject<O>] | [DecoderObject<O>]
): Decoder<O> {
	const [name, decoders] = objectNameBuilder(args)
	return new LooseObjectDecoder(name, decoders)
}


// // Partial<T>
// export function partial<T extends (any[] | Dict<any>)>(decoder: Decoder<T>): Decoder<Partial<T>> {
// 	if (decoder instanceof ObjectDecoder) {
// 		const newDecoders = {} as DecoderObject<Partial<T>>
// 		for (const key in decoder.decoders)
// 			newDecoders[key as keyof Partial<T>] = union(ObjectDecoder.decoders[key], undefinedLiteral)
// 		return decoder instanceof StrictObjectDecoder
// 			? new StrictObjectDecoder(decoder.name, newDecoders)
// 			: new LooseObjectDecoder(decoder.name, newDecoders)
// 	}
// 	if (decoder instanceof ArrayDecoder)
// 		return new ArrayDecoder(union(decoder.decoder, undefinedLiteral))
// 	if (decoder instanceof TupleDecoder)
// 		return new TupleDecoder(decoder.decoders.map(decoder => union(decoder, undefinedLiteral))) as unknown as Decoder<Partial<T>>

// 	throw new Error('the partial combinator can only be used on object, array, or tuple decoders')
// }

// Readonly<T>
// Record<K,T>
// Pick<T,K>
// Omit<T,K>
// Exclude<T,U>
// Extract<T,U>
// NonNullable<T>
// Required<T>

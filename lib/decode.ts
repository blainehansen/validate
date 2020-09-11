import { Result, Ok, Err, Maybe, Some, None } from '@blainehansen/monads'

import { Dict, Cast, TupleIntersection, FilteredTupleIntersection, TupleLike } from './utils'

export abstract class Decoder<T> {
	abstract readonly name: string
	abstract decode(input: unknown): Result<T>

	guard(input: unknown): input is T {
		return this.decode(input).isOk()
	}
}

type DecoderType<D extends Decoder<T>, T> = D & Decoder<T>

export type TypeOf<D extends Decoder<any>> = D extends Decoder<infer T> ? T : never

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
): DecoderType<AdaptorDecoder<L[number], T>, T>{
	return new AdaptorDecoder(decoder, adaptors)
}

export function adaptor<U, T>(decoder: Decoder<U>, func: (input: U) => T): SafeAdaptor<U, T> {
	return { isFallible: false, decoder, func }
}

export function tryAdaptor<U, T>(decoder: Decoder<U>, func: (input: U) => Result<T>): FallibleAdaptor<U, T> {
	return { isFallible: true, decoder, func }
}

export type DecoderTuple<L extends any[]> = {
	[K in keyof L]: Decoder<L[K]>
}


function isObject(input: unknown): input is NonNullable<Object> {
	return typeof input === 'object' && input !== null && !Array.isArray(input)
}


export interface CodecConstructor<L extends any[], T extends Codec<L>> {
	new (...args: L): T
	decode: Decoder<L>
}

export interface Codec<L extends any[] = unknown[]> {
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


class ClassDecoder<L extends any[], T extends Codec<L>> extends Decoder<T> {
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
export function cls<L extends any[], T extends Codec<L>>(cn: CodecConstructor<L, T>): DecoderType<ClassDecoder<L, T>, T> {
	return new ClassDecoder(cn)
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
export function wrap<T>(name: string, decoderFunc: (input: unknown) => Result<T>): DecoderType<WrapDecoder<T>, T> {
	return new WrapDecoder(name, decoderFunc)
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
export function recursive<T>(fn: () => Decoder<T>): DecoderType<RecursiveDecoder<T>, T> {
	return new RecursiveDecoder(fn)
}


class UnionDecoder<L extends any[]> extends Decoder<L[number]> {
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
export function union<L extends any[]>(...decoders: DecoderTuple<L>): DecoderType<UnionDecoder<L>, L[number]> {
	const flattened = [] as unknown as DecoderTuple<L>
	for (const decoder of decoders) {
		if (decoder instanceof UnionDecoder)
			Array.prototype.push.apply(flattened, decoder.decoders as unknown as any[])
		else
			flattened.push(decoder)
	}
	return new UnionDecoder<L>(flattened as DecoderTuple<L>)
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
export function literal<V extends Primitives>(value: V): DecoderType<ValuesDecoder<V, [V]>, V> {
	return new ValuesDecoder([value] as [V])
}
export function literals<V extends Primitives, L extends V[]>(...values: L): DecoderType<ValuesDecoder<V, L>, L[number]> {
	return new ValuesDecoder(values)
}

export function undefinable<T>(decoder: Decoder<T>): DecoderType<UnionDecoder<[T, undefined]>, T | undefined> {
	return new UnionDecoder([decoder, undefinedLiteral] as [Decoder<T>, Decoder<undefined>])
}
export function nullable<T>(decoder: Decoder<T>): DecoderType<UnionDecoder<[T, null]>, T | null> {
	return new UnionDecoder([decoder, nullLiteral] as [Decoder<T>, Decoder<null>])
}
export function nillable<T>(decoder: Decoder<T>): DecoderType<UnionDecoder<[T, null, undefined]>, T | null | undefined> {
	return new UnionDecoder([decoder, nullLiteral, undefinedLiteral] as [Decoder<T>, Decoder<null>, Decoder<undefined>])
}

export const undefinedLiteral = literal(undefined as undefined)
export const nullLiteral = literal(null as null)
export const trueLiteral = literal(true as true)
export const falseLiteral = literal(false as false)

class OptionalDecoder<T> extends Decoder<T | undefined> {
	readonly name: string
	constructor(readonly decoder: Decoder<T>) {
		super()
		this.name = `(${this.decoder.name})?`
	}

	decode(input: unknown): Result<T | undefined> {
		if (input === undefined) return Ok(undefined)
		return this.decoder.decode(input)
	}
}
export function optional<T>(decoder: Decoder<T>): DecoderType<OptionalDecoder<T>, T | undefined> {
	return new OptionalDecoder(
		decoder instanceof UnionDecoder
			? new UnionDecoder((decoder as UnionDecoder<unknown[]>).decoders.filter(decoder => decoder !== undefinedLiteral))
			: decoder
	) as DecoderType<OptionalDecoder<T>, T | undefined>
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
export function maybe<T>(decoder: Decoder<T>): DecoderType<MaybeDecoder<T>, Maybe<T>> {
	return new MaybeDecoder<T>(decoder)
}


function decoderErr<T>(decoder: Decoder<T>, input: unknown) {
	return Err(`expected ${decoder.name}, got ${input}`)
}

class ArrayDecoder<T, O extends Dict<any> = {}> extends Decoder<T[] & O> {
	readonly name: string
	readonly decoders: DecoderObject<O> | undefined
	constructor(readonly decoder: Decoder<T>, decoders: ObjectDecoder<O> | undefined) {
		super()
		this.name = `${decoder.name}[]`
		this.decoders = decoders ? { ...decoders.decoders } : undefined
	}

	decode(input: unknown): Result<T[] & O> {
		const { name, decoder, decoders } = this

		if (!Array.isArray(input)) return decoderErr(this, input)

		const give = [] as unknown as T[] & O
		for (let index = 0; index < input.length; index++) {
			const item = input[index]
			const result = decoder.decode(item)
			if (result.isErr())
				return Err(`while decoding ${name}: at index ${index}, failed to decode ${decoder.name}: ${result.error}`)

			give.push(result.value)
		}

		if (decoders) for (const key in decoders) {
			const decoder = decoders[key]
			const value = (input as T[] & O)[key]
			const result = decoder.decode(value)
			if (result.isErr()) return Err(`Failed to decode a valid ${name}, key ${key} has invalid value: ${value}`)
			give[key as unknown as keyof T[] & O] = result.value
		}

		return Ok(give)
	}
}
export function array<T, O extends Dict<any> = {}>(
	decoder: Decoder<T>, extra?: ObjectDecoder<O>,
): DecoderType<ArrayDecoder<T, O>, T[] & O> {
	return new ArrayDecoder(decoder, extra)
}


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
export function dictionary<T>(decoder: Decoder<T>): DecoderType<DictionaryDecoder<T>, Dict<T>> {
	return new DictionaryDecoder(decoder)
}


// class TupleDecoder<L extends any[]> extends Decoder<L> {
class TupleDecoder<L extends any[], S extends any[] = []> extends Decoder<[...L, ...S]> {
	readonly name: string
	readonly minLength: number
	// constructor(readonly decoders: DecoderTuple<L>) {
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

	decode(input: unknown): Result<[...L, ...S]> {
		const { name, decoders, spread, minLength } = this

		if (
			!Array.isArray(input)
			|| input.length < minLength
			|| (!spread && input.length > decoders.length)
		) return Err(`expected ${name}, got ${input}`)

		const keepOptionals = spread && input.length > decoders.length

		const t = [] as unknown as [...L, ...S]
		for (let index = 0; index < decoders.length; index++) {
			const decoder = decoders[index]
			const value = input[index]
			const result = decoder.decode(value)
			if (result.isErr())
				return Err(`while decoding ${name}, at index ${index}, failed to decode ${decoder.name}: ${result.error}`)

			if (keepOptionals || !(decoder instanceof OptionalDecoder && !(index in input)))
				t.push(result.value)
		}

		if (spread) {
			const rest = input.slice(decoders.length)
			const result = spread.decode(rest)
			if (result.isErr())
				return Err(`while decoding ${name}, in the spread, failed to decode ${spread.name}: ${result.error}`)
			Array.prototype.push.apply(t, result.value)
		}

		return Ok(t)
	}
}
export function tuple<L extends any[]>(...decoders: DecoderTuple<L>): DecoderType<TupleDecoder<L, []>, L> {
	return new TupleDecoder<L, []>(decoders, undefined)
}
export function spread<L extends any[], S>(
	decoders: DecoderTuple<L>,
	spread: Decoder<S>,
): DecoderType<TupleDecoder<L, S[]>, [...L, ...S[]]> {
	return new TupleDecoder<L, S[]>(decoders, new ArrayDecoder(spread, undefined))
}



type DecoderObject<O extends Dict<any>> = { [K in keyof O]: Decoder<O[K]> }

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


export abstract class ObjectDecoder<O extends Dict<any>> extends Decoder<O> {
	private readonly _brand!: true
	abstract readonly decoders: DecoderObject<O>
}


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
			if (!(decoder instanceof OptionalDecoder && !(key in input)))
				give[key as keyof O] = result.value
		}

		return Ok(give)
	}
}

export function object<O extends Dict<any>>(
	...args: [string, DecoderObject<O>] | [DecoderObject<O>]
): DecoderType<ObjectDecoder<O>, O> {
	const [name, decoders] = objectNameBuilder(args)
	return new StrictObjectDecoder(name, decoders)
}


class LooseObjectDecoder<O extends Dict<any>> extends ObjectDecoder<O> {
	constructor(
		readonly name: string,
		readonly decoders: DecoderObject<O>,
	) { super() }

	decode(input: unknown): Result<O> {
		const { name, decoders } = this

		if (!isObject(input)) return Err(`Failed to decode a valid ${name}, input is not an object: ${input}`)

		const give = { ...input } as O
		for (const key in decoders) {
			const decoder = decoders[key]
			const value = give[key]
			const result = decoder.decode(value)
			if (result.isErr()) return Err(`Failed to decode a valid ${name}, key ${key} has invalid value: ${value}`)
			if (!(decoder instanceof OptionalDecoder && !(key in input)))
				give[key as keyof O] = result.value
		}

		return Ok(give as O)
	}
}
export function looseObject<O extends Dict<any>>(
	...args: [string, DecoderObject<O>] | [DecoderObject<O>]
): DecoderType<ObjectDecoder<O>, O> {
	const [name, decoders] = objectNameBuilder(args)
	return new LooseObjectDecoder(name, decoders)
}


type AnyArrayDecoder = DecoderType<ArrayDecoder<any, Dict<any>>, any[] & Dict<any>>
type AnyTupleDecoder = DecoderType<TupleDecoder<any[]>, any[]>
type AnyObjectDecoder = DecoderType<ObjectDecoder<Dict<any>>, Dict<any>>
type AnyUnionDecoder = DecoderType<UnionDecoder<any[]>, any>

// type AllUnionExtendsObject<T> = T extends T ? T extends object ? true : false : never
// type Z = IsTrue<AllUnionExtendsObject<target>>

type IntersectableDecoder = AnyArrayDecoder | AnyTupleDecoder | AnyObjectDecoder | AnyUnionDecoder

// if there are any UnionDecoders in the mix, the result will be a UnionDecoder and the type will be
// type ScatterIntersectionAcrossUnion<T, L extends any[]> = T extends T ? TupleIntersection<[T, ...L]> : never
// or this even necessary? that's what we get for free with the boxing method right?

type DecoderForIntersection<D extends IntersectableDecoder[]> =
	D extends AnyTupleDecoder[] ? IntersectionTupleDecoder<D>
	// D extends (AnyTupleDecoder | AnyObjectDecoder)[] ? IntersectionTupleDecoder<D>
	: D extends AnyObjectDecoder[] ? IntersectionObjectDecoder<D>
	: D extends (AnyArrayDecoder | AnyObjectDecoder)[] ? IntersectionArrayDecoder<D>
	: D extends (AnyTupleDecoder | AnyArrayDecoder | AnyObjectDecoder)[] ? Decoder<never>
	: D extends (AnyUnionDecoder | AnyTupleDecoder)[] ? IntersectionUnionDecoder<D>
	: D extends (AnyUnionDecoder | AnyArrayDecoder | AnyObjectDecoder)[] ? IntersectionUnionDecoder<D>
	: Decoder<never>

declare const _marker: unique symbol
type marker = typeof _marker

type IntersectionUnionDecoder<D extends IntersectableDecoder[]> = UnionDecoder<D> & Decoder<DecoderIntersection<D>>
type DecoderIntersection<D extends Decoder<any>[]> = TupleIntersection<{
	[K in keyof D]: TypeOf<Cast<D[K], Decoder<any>>>
}>


type IntersectionArrayDecoder<D extends (AnyArrayDecoder | AnyObjectDecoder)[]> =
	ArrayDecoder<ArrayDecoderItems<D>, ArrayDecoderExtra<D>> & Decoder<ArrayDecoderItems<D>[] & ArrayDecoderExtra<D>>

type ArrayDecoderItems<D extends (AnyArrayDecoder | AnyObjectDecoder)[]> = FilteredTupleIntersection<{
	[K in keyof D]:
		D[K] extends ArrayDecoder<infer T, Dict<any>> ? T
		: D[K] extends ObjectDecoder<Dict<any>> ? marker
		: never
}, marker>
type ArrayDecoderExtra<D extends (AnyArrayDecoder | AnyObjectDecoder)[]> = Cast<TupleIntersection<{
	[K in keyof D]:
		D[K] extends ArrayDecoder<any, infer O> ? O
		: D[K] extends ObjectDecoder<infer O> ? O
		: never
}>, Dict<any>>

type IntersectionTupleDecoder<D extends AnyTupleDecoder[]> = TupleDecoder<TupleDecoderIndices<D>> & Decoder<TupleDecoderIndices<D>>
type TupleDecoderIndices<D extends AnyTupleDecoder[]> = Cast<TupleIntersection<{
	[K in keyof D]: D[K] extends TupleDecoder<infer L> ? L : never
}>, any[]>

type IntersectionObjectDecoder<D extends AnyObjectDecoder[]> = ObjectDecoder<ObjectDecoderItems<D>> & Decoder<ObjectDecoderItems<D>>
type ObjectDecoderItems<D extends AnyObjectDecoder[]> = Cast<TupleIntersection<{
	[K in keyof D]: D[K] extends ObjectDecoder<infer O> ? O : never
}>, Dict<any>>


// type ObjectDecoderTuple<L extends Dict<any>[]> = {
// 	[K in keyof L]: ObjectDecoder<L[K]>
// }

export function intersection<D extends IntersectableDecoder[]>(
	...decoders: D
): DecoderForIntersection<D> {
	const objectDecoders = [] as AnyObjectDecoder[]
	const tupleDecoders = [] as AnyTupleDecoder[]
	const arrayDecoders = [] as AnyArrayDecoder[]
	const unionDecoders = [] as AnyUnionDecoder[]
	const nameSegments: string[] = []
	for (const decoder of decoders) {
		nameSegments.push(decoder.name)
		if (decoder instanceof ObjectDecoder) objectDecoders.push(decoder)
		else if (decoder instanceof TupleDecoder) tupleDecoders.push(decoder)
		else if (decoder instanceof ArrayDecoder) arrayDecoders.push(decoder)
		else if (decoder instanceof UnionDecoder) unionDecoders.push(decoder)
		else return never as unknown as DecoderForIntersection<D>
	}
	const name = nameSegments.join(' & ')

	if (tupleDecoders.length && (arrayDecoders.length || objectDecoders.length))
		return never as unknown as DecoderForIntersection<D>

	if (unionDecoders.length) {
		const [unionDecoder, ...rest] = unionDecoders
		const finalDecoders: Decoder<any>[] = []
		for (const decoder of unionDecoder.decoders) {
			finalDecoders.push(intersection(
				decoder as IntersectableDecoder,
				...rest, ...tupleDecoders, ...arrayDecoders, ...objectDecoders
			))
		}
		return new UnionDecoder(finalDecoders) as DecoderForIntersection<D>
	}

	if (tupleDecoders.length ) {
		const finalDecoders: Decoder<any>[] = []
		const maxIndex = Math.max(...tupleDecoders.map(tupleDecoder => tupleDecoder.decoders.length))
		for (let index = 0; index < maxIndex; index++) {
			const indexDecoders = [] as IntersectableDecoder[]
			for (const tupleDecoder of tupleDecoders) {
				const indexDecoder = tupleDecoder.decoders[index]
				if (indexDecoder) indexDecoders.push(indexDecoder as IntersectableDecoder)
			}

			finalDecoders.push(intersection(...indexDecoders))
		}

		return new TupleDecoder(finalDecoders, undefined) as unknown as DecoderForIntersection<D>
	}
	else if (arrayDecoders.length) {
		const itemDecoders = [] as IntersectableDecoder[]
		// const objectNameSections: string[] = []
		for (const arrayDecoder of arrayDecoders) {
			itemDecoders.push(arrayDecoder.decoder as IntersectableDecoder)
			if (arrayDecoder.decoders) {
				objectDecoders.push(new LooseObjectDecoder('', arrayDecoder.decoders))
				// objectNameSections.push()
			}
		}

		return new ArrayDecoder(
			itemDecoders.length === 1 ? itemDecoders[0] : intersection(...itemDecoders),
			objectIntersection('', objectDecoders),
		) as DecoderForIntersection<D>
	}

	return objectIntersection(name, objectDecoders) as DecoderForIntersection<D>
}

function objectIntersection(name: string, objectDecoders: AnyObjectDecoder[]) {
	const allKeys = new Set([...objectDecoders.flatMap(decoder => Object.keys(decoder.decoders))])
	const finalDecoders = {} as DecoderObject<Dict<any>>
	for (const key of allKeys) {
		const keyDecoders = objectDecoders.flatMap(decoder => {
			const keyDecoder = decoder.decoders[key]
			return keyDecoder ? [keyDecoder] : []
		})
		if (keyDecoders.length === 0) continue
		finalDecoders[key] = keyDecoders.length === 1 ? keyDecoders[0] : intersection(...(keyDecoders as IntersectableDecoder[]))
	}

	return new LooseObjectDecoder(name, finalDecoders)
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

// https://github.com/neuledge/computed-types

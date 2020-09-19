import { Result, Ok, Err, Maybe, Some, None } from '@blainehansen/monads'
import { Decoder } from './decode'

export type SafeAdaptor<U, T> = { isFallible: false, decoder: Decoder<U>, func: (input: U) => T }
export type FallibleAdaptor<U, T> = { isFallible: true, decoder: Decoder<U>, func: (input: U) => Result<T> }
export type Adaptor<U, T> =
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
	return new AdaptorDecoder(decoder, adaptors)
}

export function adaptor<U, T>(decoder: Decoder<U>, func: (input: U) => T): SafeAdaptor<U, T> {
	return { isFallible: false, decoder, func }
}

export function tryAdaptor<U, T>(decoder: Decoder<U>, func: (input: U) => Result<T>): FallibleAdaptor<U, T> {
	return { isFallible: true, decoder, func }
}

// TODO various adaptors for common datatypes

interface Constructable<L extends any[], T> {
	new (...args: L): T
}
class ClassDecoder<T> extends Decoder<T> {
	readonly name: string
	constructor(readonly clz: Constructable<any[], T>) {
		super()
		this.name = clz.name
	}

	decode(input: unknown) {
		return input instanceof this.clz ? Ok(input) : Err(`expected instanceof ${this.name}, got ${input}`)
	}
}
export function cls<L extends any[], T>(
	clz: Constructable<L, T>,
	argsDecoder: Decoder<L>,
): Decoder<T> {
	return new AdaptorDecoder(
		new ClassDecoder(clz as Constructable<any[], T>),
		[{ isFallible: false as const, decoder: argsDecoder, func: args => new clz(...args) }],
	)
}

import { Result, Ok, Err } from '@blainehansen/monads'
import { Validator, CombinatorValidator, callIsExact } from './validate'

export type SafeAdaptor<U, T> = { isFallible: false, validator: Validator<U>, func: (input: U) => T }
export type FallibleAdaptor<U, T> = { isFallible: true, validator: Validator<U>, func: (input: U) => Result<T> }
export type Adaptor<U, T> =
	| SafeAdaptor<U, T>
	| FallibleAdaptor<U, T>

type AdaptorTuple<L extends any[], T> = {
	[K in keyof L]: Adaptor<L[K], T>
}

class AdaptorValidator<U, T> extends CombinatorValidator<T> {
	readonly name: string
	constructor(
		readonly validator: Validator<T>,
		readonly adaptors: Adaptor<U, T>[],
	) {
		super()
		this.name = `adaptable ${validator.name}`
	}

	_validate(input: unknown, isExact: boolean): Result<T> {
		const { name, validator, adaptors } = this
		const baseAttempt = callIsExact(validator, isExact, input)
		if (baseAttempt.isOk())
			return baseAttempt

		for (const adaptor of adaptors) {
			const adaptorResult = callIsExact(adaptor.validator, isExact, input)
			if (adaptorResult.isErr()) continue
			const adaptorAttempt = adaptor.isFallible
				? adaptor.func(adaptorResult.value)
				: Ok(adaptor.func(adaptorResult.value))

			if (adaptorAttempt.isOk())
				return adaptorAttempt
		}

		const names = adaptors.map(a => a.validator.name).join(', ')
		return Err(`in ${name}, couldn't validate from any of [${names}]; got ${input}`)
	}
}

export function adapt<L extends any[], T>(
	validator: Validator<T>,
	...adaptors: AdaptorTuple<L, T>
): Validator<T> {
	return new AdaptorValidator(validator, adaptors)
}

export function adaptor<U, T>(validator: Validator<U>, func: (input: U) => T): SafeAdaptor<U, T> {
	return { isFallible: false, validator, func }
}

export function tryAdaptor<U, T>(validator: Validator<U>, func: (input: U) => Result<T>): FallibleAdaptor<U, T> {
	return { isFallible: true, validator, func }
}

// TODO various adaptors for common datatypes

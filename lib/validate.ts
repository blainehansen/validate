import { Result, Ok, Err, Maybe, Some, None } from '@blainehansen/monads'

import { Dict, TupleIntersection, isObject } from './utils'

export abstract class Validator<T> {
	abstract readonly name: string
	abstract validate(input: unknown): Result<T>
	abstract validateExact(input: unknown): Result<T>
}
export function callIsExact<T>(validator: Validator<T>, isExact: boolean, input: unknown): Result<T> {
	return isExact ? validator.validateExact(input) : validator.validate(input)
}

export type ValidatorTuple<L extends any[]> = {
	[K in keyof L]: Validator<L[K]>
}
export type TypeOf<D extends Validator<any>> = D extends Validator<infer T> ? T : never

function validatorErr(name: string, input: unknown) {
	return Err(`expected ${name}, got ${input}`)
}

export abstract class SameValidator<T> extends Validator<T> {
	abstract readonly name: string
	protected abstract _validate(input: unknown): Result<T>
	validate(input: unknown): Result<T> { return this._validate(input) }
	validateExact(input: unknown): Result<T> { return this._validate(input) }
}

export abstract class CombinatorValidator<T> extends Validator<T> {
	abstract readonly name: string
	protected abstract _validate(input: unknown, isExact: boolean): Result<T>
	validate(input: unknown): Result<T> { return this._validate(input, false) }
	validateExact(input: unknown): Result<T> { return this._validate(input, true) }
}

class WrapValidator<T> extends SameValidator<T> {
	constructor(
		readonly name: string,
		readonly validatorFunc: (input: unknown) => Result<T>,
	) { super() }

	_validate(input: unknown) {
		return this.validatorFunc(input)
	}
}
export function wrap<T>(name: string, validatorFunc: (input: unknown) => Result<T>): Validator<T> {
	return new WrapValidator(name, validatorFunc)
}

class EnumValidator<T> extends SameValidator<T> {
	constructor(
		readonly name: string,
		readonly validatorFunc: (input: unknown) => T | undefined,
	) { super() }

	_validate(input: unknown): Result<T> {
		const { name, validatorFunc } = this
		const result = validatorFunc(input)
		return result === undefined ? validatorErr(name, input) : Ok(result)
	}
}
export function wrapEnum<T>(name: string, validatorFunc: (input: unknown) => T | undefined): Validator<T> {
	return new EnumValidator(name, validatorFunc)
}


type Func<L extends any[], T> = (...args: L) => T
export class FunctionValidator<L extends any[], T> {
	readonly name: string
	constructor(readonly fn: Func<L, T>, readonly argsValidator: Validator<L>) {
		this.name = fn.name
	}

	validateCall(input: unknown): Result<T> {
		const { name, fn, argsValidator } = this
		const argsResult = argsValidator.validate(input)
		return argsResult.isErr()
			? Err(`expected args to call ${name}, got ${input}`)
			: Ok(fn(...argsResult.value))
	}
}
export function func<L extends any[], T>(fn: Func<L, T>, argsValidator: Validator<L>) {
	return new FunctionValidator(fn, argsValidator)
}



export interface Constructable<L extends any[], T> {
	new (...args: L): T
}
class ClassValidator<L extends any[], T> extends CombinatorValidator<T> {
	readonly name: string
	constructor(readonly clz: Constructable<L, T>, readonly constructorArgsValidator: Validator<L>) {
		super()
		this.name = clz.name
	}

	_validate(input: unknown, isExact: boolean): Result<T> {
		const { name, clz, constructorArgsValidator } = this
		if (input instanceof clz) return Ok(input)

		const argsResult = callIsExact(constructorArgsValidator, isExact, input)
		return argsResult.isErr()
			? Err(`expected instance of or args to construct ${name}, got ${input}`)
			: Ok(new clz(...argsResult.value))
	}
}
export function cls<L extends any[], T>(clz: Constructable<L, T>, constructorArgsValidator: Validator<L>): Validator<T> {
	return new ClassValidator(clz, constructorArgsValidator)
}


export const unknown = new WrapValidator(
	'unknown',
	function(input: unknown): Result<unknown> {
		return Ok(input)
	},
)
export const never = new WrapValidator(
	'never',
	function(_input: unknown): Result<never> {
		return Err('never') as Result<never>
	}
)
export const string = new WrapValidator(
	'string',
	function(input: unknown): Result<string> {
		if (typeof input === 'string') return Ok(input)
		else return Err(`expected string, got ${input}`)
	},
)
export const boolean = new WrapValidator(
	'boolean',
	function (input: unknown): Result<boolean> {
		if (typeof input === 'boolean') return Ok(input)
		else return Err(`expected boolean, got ${input}`)
	},
)
export const number = new WrapValidator(
	'number',
	function validate(input: unknown): Result<number> {
		if (
			typeof input === 'number'
			&& input !== Infinity
			&& input !== -Infinity
			&& !isNaN(input)
		) return Ok(input)
		else return Err(`expected number, got ${input}`)
	},
)
export const looseNumber = new WrapValidator(
	'looseNumber',
	function validate(input: unknown): Result<number> {
		if (typeof input === 'number') return Ok(input)
		else return Err(`expected number, got ${input}`)
	},
)
export const int = new WrapValidator(
	'int',
	function validate(input: unknown): Result<number> {
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
export const uint = new WrapValidator(
	'uint',
	function validate(input: unknown): Result<number> {
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


class RecursiveValidator<T> extends CombinatorValidator<T> {
	readonly name!: string
	constructor(readonly fn: () => Validator<T>) { super() }

	_validate(input: unknown, isExact: boolean) {
		const validator = this.fn()
		if ((this.name as any) === undefined)
			(this.name as any) = validator.name

		return callIsExact(validator, isExact, input)
	}
}
export function recursive<T>(fn: () => Validator<T>): Validator<T> {
	return new RecursiveValidator(fn)
}


class MaybeValidator<T> extends CombinatorValidator<Maybe<T>> {
	readonly name: string
	constructor(readonly validator: Validator<T>) {
		super()
		this.name = `Maybe<${validator.name}>`
	}
	_validate(input: unknown, isExact: boolean): Result<Maybe<T>> {
		if (input === null || input === undefined)
			return Ok(None)
		// if (Maybe.isMaybe(input))
		// 	return input.match({
		// 		some: value => this.validator
		// 			.validate(value)
		// 			.change(value => Some(value)),
		// 		none: () => Ok(None),
		// 	})
		const { name, validator } = this
		return callIsExact(validator, isExact, input)
			.change(value => Some(value))
			.changeErr(err => `expected ${name}, encountered this error: ${err}`)
	}
}
export function maybe<T>(validator: Validator<T>): Validator<Maybe<T>> {
	return new MaybeValidator<T>(validator)
}


class UnionValidator<L extends any[]> extends CombinatorValidator<L[number]> {
	readonly name: string
	readonly validators: ValidatorTuple<L>
	constructor(validators: ValidatorTuple<L>) {
		super()
		const flattened = [] as unknown as ValidatorTuple<L>
		for (const validator of validators) {
			if (validator instanceof UnionValidator)
				Array.prototype.push.apply(flattened, validator.validators as unknown as any[])
			else
				flattened.push(validator)
		}
		this.name = flattened.map(d => d.name).join(' | ')
		this.validators = flattened
	}

	_validate(input: unknown, isExact: boolean) {
		for (const validator of this.validators) {
			const result = callIsExact(validator, isExact, input)
			if (result.isOk()) return result
		}

		return Err(`expected ${this.name}; got ${input}`)
	}
}
export function union<L extends any[]>(...validators: ValidatorTuple<L>): Validator<L[number]> {
	return new UnionValidator<L>(validators)
}


type Primitives = string | boolean | number | bigint | null | undefined | void
class ValuesValidator<V extends Primitives, L extends V[]> extends SameValidator<L[number]> {
	readonly name: string
	constructor(readonly values: L) {
		super()
		this.name = values.map(v => `${v}`).join(' | ')
	}

	_validate(input: unknown): Result<L[number]> {
		for (const value of this.values)
			if (value === input) return Ok(value)

		return Err(`expected ${this.name}; got ${input}`)
	}
}
export function literal<V extends Primitives>(value: V): Validator<V> {
	return new ValuesValidator([value] as [V])
}
export function literals<L extends Primitives[]>(...values: L): Validator<L[number]> {
	return new ValuesValidator(values)
}

export function undefinable<T>(validator: Validator<T>): Validator<T | undefined> {
	return new UnionValidator([validator, undefinedLiteral] as [Validator<T>, Validator<undefined>])
}
export function nullable<T>(validator: Validator<T>): Validator<T | null> {
	return new UnionValidator([validator, nullLiteral] as [Validator<T>, Validator<null>])
}
export function nillable<T>(validator: Validator<T>): Validator<T | null | undefined> {
	return new UnionValidator([validator, nullLiteral, undefinedLiteral] as [Validator<T>, Validator<null>, Validator<undefined>])
}

export const undefinedLiteral = literal(undefined as undefined)
export const nullLiteral = literal(null as null)
export const voidLiteral = literal(undefined as void)
export const trueLiteral = literal(true as true)
export const falseLiteral = literal(false as false)


class OptionalValidator<T> extends CombinatorValidator<T | undefined> {
	readonly name: string
	readonly validator: Validator<T>
	constructor(validator: Validator<T>) {
		super()
		this.name = `(${validator.name})?`
		this.validator = validator instanceof UnionValidator
			? new UnionValidator((validator as UnionValidator<unknown[]>).validators.filter(validator => validator !== undefinedLiteral)) as Validator<T>
			: validator
	}

	_validate(input: unknown, isExact: boolean): Result<T | undefined> {
		if (input === undefined) return Ok(undefined)
		return callIsExact(this.validator, isExact, input)
	}
}
export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
	return new OptionalValidator(validator)
}


class ArrayValidator<T> extends CombinatorValidator<T[]> {
	readonly name: string
	constructor(readonly validator: Validator<T>) {
		super()
		this.name = `${validator.name}[]`
	}

	_validate(input: unknown, isExact: boolean): Result<T[]> {
		const { name, validator } = this

		if (!Array.isArray(input)) return validatorErr(name, input)

		for (let index = 0; index < input.length; index++) {
			const item = input[index]
			const result = callIsExact(validator, isExact, item)
			if (result.isErr())
				return Err(`while validating ${name}: at index ${index}, failed to validate ${validator.name}: ${result.error}`)
		}

		return Ok(input)
	}
}
export function array<T>(validator: Validator<T>): Validator<T[]> {
	return new ArrayValidator(validator)
}


class DictionaryValidator<T> extends CombinatorValidator<Dict<T>> {
	readonly name: string
	constructor(readonly validator: Validator<T>) {
		super()
		this.name = `Dict<${validator.name}>`
	}

	_validate(input: unknown, isExact: boolean): Result<Dict<T>> {
		const { name, validator } = this

		if (!isObject(input) || Array.isArray(input)) return validatorErr(name, input)

		for (const key in input) {
			const value = (input as any)[key]
			const result = callIsExact(validator, isExact, value)
			if (result.isErr())
				return Err(`while validating ${name}, at key ${key}, failed to validate ${validator.name}: ${result.error}`)
		}

		return Ok(input as Dict<T>)
	}
}
export function dictionary<T>(validator: Validator<T>): Validator<Dict<T>> {
	return new DictionaryValidator(validator)
}


class RecordValidator<K extends string | number | symbol, T> extends CombinatorValidator<Record<K, T>> {
	readonly name: string
	constructor(readonly keys: K[], readonly validator: Validator<T>) {
		super()
		this.name = `Record<${keys.map(key => typeof key === 'string' ? `"${key}"` : key).join(' | ')}, ${validator.name}>`
	}

	_validate(input: unknown, isExact: boolean): Result<Record<K, T>> {
		const { name, keys, validator } = this
		if (!isObject(input)) return validatorErr(name, input)

		for (const key of keys) {
			const value = (input as any)[key]
			const result = callIsExact(validator, isExact, value)
			if (result.isErr()) return Err(`in ${name}, invalid key ${key}, got ${value}, error: ${result.error}`)
		}

		return Ok(input as Record<K, T>)
	}
}
export function record<K extends string | number | symbol, T>(keys: K[], validator: Validator<T>): Validator<Record<K, T>> {
	return new RecordValidator(keys, validator)
}


class TupleValidator<L extends any[], S extends any[] = []> extends CombinatorValidator<[...L, ...S]> {
	readonly name: string
	readonly minLength: number
	constructor(readonly validators: ValidatorTuple<L>, readonly spread: Validator<S> | undefined) {
		super()
		const spreadSection = spread ? `, ...${spread.name}` : ''
		this.name = `[${validators.map(d => d.name).join(', ')}${spreadSection}]`
		let index = validators.length - 1
		while (index >= 0) {
			const validator = validators[index]
			index--
			if (!(validator instanceof OptionalValidator)) break
		}
		this.minLength = index + 1
	}

	_validate(input: unknown, isExact: boolean): Result<[...L, ...S]> {
		const { name, validators, spread, minLength } = this

		if (
			!Array.isArray(input)
			|| input.length < minLength
			|| (!spread && input.length > validators.length)
		) return validatorErr(name, input)

		for (let index = 0; index < validators.length; index++) {
			const validator = validators[index]
			const value = input[index]
			const result = callIsExact(validator, isExact, value)
			if (result.isErr())
				return Err(`while validating ${name}, at index ${index}, failed to validate ${validator.name}: ${result.error}`)
		}

		if (spread) {
			const rest = input.slice(validators.length)
			const result = callIsExact(spread, isExact, rest)
			if (result.isErr())
				return Err(`while validating ${name}, in the spread, failed to validate ${spread.name}: ${result.error}`)
		}

		return Ok(input as [...L, ...S])
	}
}
export function tuple<L extends any[]>(...validators: ValidatorTuple<L>): Validator<L> {
	return new TupleValidator<L, []>(validators, undefined)
}
export function spread<L extends any[], S extends any[]>(
	...args: [...ValidatorTuple<L>, Validator<S>]
): Validator<[...L, ...S]> {
	const validators = args.slice(0, args.length - 1) as ValidatorTuple<L>
	const spread = args[args.length - 1] as Validator<S>
	return new TupleValidator<L, S>(validators, spread)
}


type ValidatorObject<O extends Dict<any>> = { [K in keyof O]: Validator<O[K]> }
class ObjectValidator<O extends Dict<any>> extends CombinatorValidator<O> {
	readonly name: string
	readonly validators: ValidatorObject<O>
	constructor(args: [string, ValidatorObject<O>] | [ValidatorObject<O>]) {
		super()
		if (args.length === 2) {
			const [name, validators] = args
			this.name = name
			this.validators = validators
		}
		else {
			const [validators] = args
			const pairs = Object.entries(validators).map(([key, value]) => `${key}: ${value.name}`)
			const name = pairs.length < 5
				? `{ ${pairs.join(', ')} }`
				: `{\n\t${pairs.join(',\n\t')}\n}`

			this.name = name
			this.validators = validators
		}
	}

	_validate(input: unknown, isExact: boolean): Result<O> {
		const { name, validators } = this
		if (!isObject(input)) return Err(`Failed to validate a valid ${name}, input is not an object: ${input}`)

		for (const key in validators) {
			const validator = validators[key]
			const value = (input as any)[key]
			const result = callIsExact(validator, isExact, value)
			if (result.isErr()) return Err(`Failed to validate a valid ${name}, key ${key} has invalid value: ${value}`)
		}
		if (!isExact)
			return Ok(input as O)

		for (const key in input)
			if (!(key in validators)) return Err(`Failed to validate a valid ${name}, input had invalid extra key ${key}`)
		return Ok(input as O)
	}
}
export function object<O extends Dict<any>>(
	...args: [string, ValidatorObject<O>] | [ValidatorObject<O>]
): Validator<O> {
	return new ObjectValidator(args)
}


type UnknownObjectValidator = ObjectValidator<Dict<unknown>>
type UnknownArrayValidator = ArrayValidator<unknown>
type UnknownUnionValidator = UnionValidator<unknown[]>

class IntersectionValidator<L extends any[]> extends CombinatorValidator<TupleIntersection<L>> {
	readonly name: string
	constructor(readonly validators: ValidatorTuple<L>) {
		super()
		this.name = validators.map(validator => validator.name).join(' & ')
	}

	_validate(input: unknown, isExact: boolean): Result<TupleIntersection<L>> {
		const { name, validators } = this
		for (const validator of validators) {
			const result = callIsExact(validator, isExact, input)
			if (result.isErr()) return Err(`expected ${name}, got ${input}: ${result.error}`)
		}
		return Ok(input as TupleIntersection<L>)
	}
}
export function intersection<L extends any[]>(...validators: ValidatorTuple<L>): Validator<TupleIntersection<L>> {
	const objectValidators = [] as UnknownObjectValidator[]
	const arrayValidators = [] as UnknownArrayValidator[]
	const unionValidators = [] as UnknownUnionValidator[]
	const otherValidators = [] as Validator<unknown>[]

	const validatorsQueue = validators.slice()
	let validator
	while (validator = validatorsQueue.shift()) {
		if (validator instanceof ObjectValidator) objectValidators.push(validator)
		else if (validator instanceof ArrayValidator) arrayValidators.push(validator)
		else if (validator instanceof UnionValidator) unionValidators.push(validator)
		else if (validator instanceof IntersectionValidator)
			Array.prototype.push.apply(validatorsQueue, validator.validators as unknown as Validator<unknown>[])
		else otherValidators.push(validator)
	}

	if (unionValidators.length) {
		const finalUnionValidators = [] as Validator<unknown>[]
		const [unionValidator, ...rest] = unionValidators
		for (const validator of unionValidator.validators) {
			finalUnionValidators.push(intersection(
				validator,
				...rest, ...objectValidators, ...arrayValidators, ...otherValidators,
			))
		}
		return new UnionValidator(finalUnionValidators) as Validator<TupleIntersection<L>>
	}

	const finalValidators = otherValidators as unknown as ValidatorTuple<L>
	if (objectValidators.length) {
		const objectKeyValidators = {} as Dict<Validator<unknown>[]>
		for (const objectValidator of objectValidators)
			for (const key in objectValidator.validators)
				(objectKeyValidators[key] || (objectKeyValidators[key] = [])).push(objectValidator.validators[key])

		const finalKeyValidators = {} as ValidatorObject<Dict<unknown>>
		for (const key in objectKeyValidators) {
			const keyValidators = objectKeyValidators[key]
			finalKeyValidators[key] = keyValidators.length === 1 ? keyValidators[0] : intersection(...keyValidators)
		}
		finalValidators.push(new ObjectValidator([finalKeyValidators]))
	}

	if (arrayValidators.length) {
		const arrayValidator = arrayValidators.length === 1
			? arrayValidators[0]
			: new ArrayValidator(intersection(...arrayValidators.map(arrayValidator => arrayValidator.validator)))
		finalValidators.push(arrayValidator)
	}

	return new IntersectionValidator<L>(finalValidators)
}


export function partial<T>(validator: Validator<T>): Validator<Partial<T>> {
	if (validator instanceof ObjectValidator) {
		const finalKeyValidators = {} as ValidatorObject<Partial<T>>
		for (const key in validator.validators) {
			const keyValidator = validator.validators[key]
			finalKeyValidators[key as keyof ValidatorObject<Partial<T>>] = partialWrapOptional(keyValidator)
		}
		return new ObjectValidator([finalKeyValidators])
	}

	if (validator instanceof ArrayValidator)
		return validator.validator instanceof OptionalValidator
			? validator
			: new ArrayValidator(new OptionalValidator(validator.validator)) as unknown as Validator<Partial<T>>

	if (validator instanceof TupleValidator) {
		const finalIndexValidators = (validator.validators as unknown as Validator<any>[]).map(partialWrapOptional)
		return new TupleValidator(
			finalIndexValidators,
			validator.spread ? partial(validator.spread) as Validator<any[]> : undefined,
		) as unknown as Validator<Partial<T>>
	}

	if (validator instanceof DictionaryValidator)
		return validator.validator instanceof OptionalValidator
			? validator
			: new DictionaryValidator(new OptionalValidator(validator.validator)) as unknown as Validator<Partial<T>>

	if (validator instanceof UnionValidator)
		return new UnionValidator((validator.validators as unknown as Validator<any>[]).map(partial))

	if (validator instanceof IntersectionValidator)
		return new IntersectionValidator((validator.validators as unknown as Validator<any>[]).map(partial))

	// if (validator instanceof ClassValidator)
	return validator
}
function partialWrapOptional<T>(validator: Validator<T>): Validator<T | undefined> {
	return validator instanceof OptionalValidator ? validator : new OptionalValidator(validator)
}


export function required<T>(validator: Validator<T>): Validator<Required<T>> {
	if (validator instanceof ObjectValidator) {
		const finalKeyValidators = {} as ValidatorObject<Required<T>>
		for (const key in validator.validators) {
			const keyValidator = validator.validators[key]
			finalKeyValidators[key as keyof ValidatorObject<Required<T>>] = requiredUnwrapOptional(keyValidator)
		}
		return new ObjectValidator([finalKeyValidators])
	}

	if (validator instanceof ArrayValidator)
		return new ArrayValidator(requiredUnwrapUndefinable(validator.validator)) as unknown as Validator<Required<T>>

	if (validator instanceof TupleValidator) {
		const finalIndexValidators = (validator.validators as unknown as Validator<any>[]).map(requiredUnwrapOptional)
		return new TupleValidator(
			finalIndexValidators,
			validator.spread ? required(validator.spread) as Validator<any[]> : undefined,
		) as unknown as Validator<Required<T>>
	}

	// if (validator instanceof DictionaryValidator)
	// 	return new DictionaryValidator(required(validator.validator)) as unknown as Validator<Required<T>>

	if (validator instanceof UnionValidator)
		return new UnionValidator((validator.validators as unknown as Validator<any>[]).map(required)) as unknown as Validator<Required<T>>

	if (validator instanceof IntersectionValidator)
		return new IntersectionValidator((validator.validators as unknown as Validator<any>[]).map(required)) as unknown as Validator<Required<T>>

	// if (validator instanceof ClassValidator)
	return validator as Validator<Required<T>>
}
function requiredUnwrapOptional<T>(validator: Validator<T | undefined>): Validator<T> {
	return validator instanceof OptionalValidator ? validator.validator : validator
}
function requiredUnwrapUndefinable<T>(initial: Validator<T | undefined>): Validator<T> {
	const validator = requiredUnwrapOptional(initial)
	if (validator instanceof UnionValidator) {
		const finalValidators = (validator as UnionValidator<unknown[]>).validators
			.filter(validator => validator !== undefinedLiteral)

		return finalValidators.length === 1
			? finalValidators[0] as Validator<T>
			: new UnionValidator(finalValidators) as Validator<T>
	}
	if (validator instanceof ValuesValidator)
		return new ValuesValidator(validator.values.filter((value: Primitives) => value !== undefined))

	return validator
}


export function nonnullable<T>(validator: Validator<T>): Validator<NonNullable<T>> {
	if (validator instanceof OptionalValidator)
		return nonnullable(validator.validator)
	if (validator instanceof ValuesValidator)
		return new ValuesValidator(validator.values.filter((value: Primitives) => value !== null && value !== undefined)) as Validator<NonNullable<T>>

	if (validator instanceof UnionValidator) {
		const finalValidators = (validator as UnionValidator<unknown[]>).validators
			.filter(validator => validator !== undefinedLiteral && validator !== nullLiteral)

		return finalValidators.length === 1
			? finalValidators[0] as unknown as Validator<NonNullable<T>>
			: new UnionValidator(finalValidators) as Validator<NonNullable<T>>
	}

	return validator as Validator<NonNullable<T>>
}

// function unwrapValidators(validator: UnionValidator) {
// 	//
// }

export function readonly<T>(validator: Validator<T>): Validator<Readonly<T>> {
	return validator
}


export function pick<T, K extends keyof T>(validator: Validator<T>, ...keys: K[]): Validator<Pick<T, K>> {
	// it's absurd to try to replicate the behavior of Pick in a spread tuple
	if (validator instanceof ObjectValidator || validator instanceof TupleValidator) {
		const finalKeyValidators = {} as ValidatorObject<Pick<T, K>>
		for (const key of keys)
			finalKeyValidators[key] = validator.validators[key]
		return new ObjectValidator([finalKeyValidators])
	}

	return validator
}

export function omit<T, K extends keyof T>(validator: Validator<T>, ...keys: K[]): Validator<Omit<T, K>> {
	// if (validator instanceof ObjectValidator || validator instanceof TupleValidator) {
	if (validator instanceof ObjectValidator) {
		const finalKeyValidators = {} as ValidatorObject<Omit<T, K>>
		for (const key in validator.validators) {
			if (keys.includes(key as K)) continue
			finalKeyValidators[key as keyof ValidatorObject<Omit<T, K>>] = validator.validators[key]
		}
		return new ObjectValidator([finalKeyValidators])
	}

	return validator
}


export * from './adapt'

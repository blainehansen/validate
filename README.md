# `validate`

A convenient typescript validation/decoding library with an accompanying helper macro.

Need to validate unknown input from the outside world, such as files, environment variables, or incoming http request bodies? This library gives a type-driven way to do so, either manually or with a [`macro-ts`](https://github.com/blainehansen/macro-ts) decorator macro, and uses the safe [`Result` type from `@blainehansen/monads`](https://github.com/blainehansen/monads) to indicate success or failure rather than throwing exceptions.

```ts
import * as v, { Result } from '@blainehansen/validate'

// first define your validators,
// either with the `validator` macro...
@validator!!()
type Person = {
  name: string,
  age: number,
  mainLanguage: 'english' | 'spanish' | 'chinese',
  mailingAddress: null | { street: string, city: string },
  emails: { address: string, validated: boolean }[],
}

// ... or manually ...
namespace Person {
  export const validator = v.object('Person', {
    name: v.string,
    age: v.number,
    mainLanguage: v.literals('english', 'spanish', 'chinese'),
    mailingAddress: v.union(
      v.nullLiteral,
      v.object({ street: v.string, city: v.string })
    ),
    emails: v.array(
      v.object({ address: v.string, validated: v.boolean }),
    ),
  })
}
type Person = v.TypeOf<typeof Person.validator>

// ... and then use!
function parsePersonFile(fileContents: string) {
  const parsed: unknown = JSON.parse(fileContents)
  const personResult = Person.validator.validate(parsed)
  personResult.match({
    ok: validPerson => { console.log('yay!') },
    err: errorMessage => { console.error('boo!') }
  })
}
```

## The `validator` Macro

The `validator` macro can automatically generate validators for most type aliases, enums, interfaces, and classes. It can also be used on function declarations, but it doesn't produce a `Validator`, but a `FunctionValidator` (see below).

If some type isn't covered by the below descriptions, then it isn't supported. The typescript type system is extremely complex, so there are some types that will be rejected by the macro. Pull requests are welcome!

### Base Types

The types that `validator` can generate validators for are the following:

#### Object, Array, and Tuple Types

These varieties use the `object`, `array`, and `tuple` combinators specified below. Tuple types can handle valid spreads at the end of the tuple.

```ts
@validator!!()
type A = { a: string }
// generates:
namespace A {
  export const validator = v.object('A', {
    a: v.string
  })
}

@validator!!()
type A = string[]
// generates:
namespace A {
  export const validator = v.array(v.string)
}

@validator!!()
type A = [string, number]
// generates:
namespace A {
  export const validator = v.tuple(v.string, v.number)
}

@validator!!()
type A = [string, number, ...boolean[]]
// generates:
namespace A {
  export const validator = v.spread(
    v.string,
    v.number,
    v.array(v.boolean),
  )
}
```

#### References

Type references assume that the referenced type has a validator at `TypeName.validator`, so any type you use in a `validator` type must also have it's own validator defined.

```ts
@validator!!()
type C = { a: A, b: B }
// will generate:
namespace C {
  export const validator = v.object('C', {
    a: A.validator,
    b: B.validator,
  })
}
```

Generic types will create `TypeName.validator` as a generic function that takes concrete validators.

```ts
@validator!!()
type Box<T> = { item: T }
// will generate:
namespace Box {
  export function validator<T>(T: v.Validator<T>): v.Validator<Box<T>> {
    return v.object('Box', {
      item: T,
    })
  }
}
```

The builtin references `Array`, `Partial`, `Required`, `Readonly`, `NonNullable`, `Pick`, `Omit`, `Record`, and the validate library type `Dict` will all use the library combinators specified below in the `api` section when used with the right number of generic arguments.

```ts
@validator!!()
type Arr = Array<string>
@validator!!()
type Arr = string[]

// both will generate:
namespace Arr {
  export const validator = v.array(v.string)
}
```

#### Unions

```ts
@validator!!()
type A = string | number | boolean[]
// will generate:
namespace A {
  export const validator = v.union(
    v.string,
    v.number,
    v.array(v.boolean),
  )
}
```

#### Intersections

Intersections in typescript are very complex in practice, but at the end of the day an intersection type simply means that *all* the type contracts in the intersection all hold simultaneously. For some types this is impossible (`string & number`, `[] & string[]`). This library does the simple thing and just requires that each validator it's given passes, so some intersection validators will never be successful on any input!

```ts
@validator!!()
type A = string[] & { a: number }
// will generate:
namespace A {
  export const validator = v.intersection(
    v.array(v.string),
    v.object({ a: v.number }),
  )
}
```

#### Literal Types

Boolean, string, number, and bigint literals are supported.

```ts
@validator!!()
type A = true | 'a' | 1 | 10n
// will generate:
namespace A {
  export const validator = v.literals(true, 'a', 1, 10n)
}

@validator!!()
type A =
  | { ok: true, value: number }
  | { ok: false }
// will generate:
namespace A {
  export const validator = v.union(
    v.object({ ok: v.literal(true), value: v.number }),
    v.object({ ok: v.literal(false) }),
  )
}
```

#### Parenthesized Types

Don't worry, these are handled :smile:

### Enums

Say you had an enum like this:

```ts
@validator!!()
enum Color  {
  RED, GREEN, BLUE,
}
```

Something like this will be generated:

```ts
namespace Color {
  export const validator = v.wrapEnum('Color', input => {
    switch (input) {
      case Color.RED:
      case Color.GREEN:
      case Color.BLUE:
        return input
      default:
        return undefined
    }
  })
}
```

### Interfaces

Basic interfaces without any `extends` clauses will generate the same thing as an object literal type alias. But `extends` clause types make the type act like an intersection.

So this:

```ts
@validator!!()
interface B extends A {
  b: number,
}
```

will generate this:

```ts
namespace B {
  export const validator = v.intersection(
    v.object('B', { b: v.number }),
    A.validator,
  )
}
```

### Classes

Classes are unusual, since instances are created with possibly different values than the object's final shape. Right now `validator` inspects the constructor of a class, and uses the `cls` combinator to produce a validator that first performs a direct `instanceof` check, and then tries to validate the type of the constructor args, and if successful then constructs an instance of the class.

This system doesn't make much sense, and a more reasonable one will likely be implemented in the future.

```ts
@validator!!()
class A {
  constructor(readonly a: string) {}
}
// will generate:
namespace A {
  export const validator = v.cls(A, v.tuple(v.string))
}
```

Here's the type signature of the `cls` combinator:

```ts
interface Constructable<L extends any[], T> {
  new (...args: L): T
}
function cls<L extends any[], T>(
  clz: Constructable<L, T>,
  constructorArgsValidator: Validator<L>,
): Validator<T> {}
```


### Function Declarations

When used on a function declaration, the `validator` macro produces a `FunctionValidator` instance. This allows you to call the function with unknown input, which will first be validated against the type of the function args before calling the actual function.

```ts
@validator!!()
function sillyFunction(left: string, right: number): number {
  return left.length + right
}

const callResult: Result<number> = sillyFunction
  .validateCaller.validateCall(unknownArgs)
```

When `validator` is used on a generic function, the return type must be annotated.


## Common Types

### `abstract class Validator<T>`

This abstract class defines the interface for all validators.

```ts
abstract class Validator<T> {
  abstract readonly name: string
  abstract validate(input: unknown): Result<T>
  abstract validateExact(input: unknown): Result<T>
}
```

In general you should use the `wrap` combinator to create custom validators rather than extending the `Validator` class. However if you choose to extend, the combinators described below might not play nice with your custom validators.


### `type TypeOf<V extends Validator<unknown>> = V extends Validator<infer T> ? T : never`

Extracts the type of the validator. Useful when you would like to construct a validator first, and use the type it defines.

```ts
type A = v.TypeOf<typeof v.string> // === string
const NumberOrBoolean = v.union(v.number, v.boolean)
type NumberOrBoolean = v.TypeOf<typeof NumberOrBoolean> // === number | boolean
const = ''
```

## Static Validators

### `string: Validator<string>`

Validates strings.

```ts
v.string.validate('a') === Ok('a')
```

### `boolean: Validator<boolean>`

Validates booleans.

```ts
v.boolean.validate(true) === Ok(true)
```

### `number: Validator<number>`

Validates numbers. Doesn't allow any form of `NaN` or `Infinity`.

```ts
v.number.validate(1.1) === Ok(1.1)
```

### `looseNumber: Validator<number>`

Validates numbers. Does allow any form of `NaN` or `Infinity`.

```ts
v.looseNumber.validate(NaN) === Ok(NaN)
```

### `int: Validator<number>`

Validates numbers if they have no decimal component.

```ts
v.int.validate(-1) === Ok(-1)
```

### `uint: Validator<number>`

Validates numbers if they have no decimal component and are positive.

```ts
v.uint.validate(1) === Ok(1)
```

### `undefinedLiteral: Validator<undefined>`

Validates `undefined`.

```ts
v.undefinedLiteral.validate(undefined) === Ok(undefined)
```

### `nullLiteral: Validator<null>`

Validates `null`.

```ts
v.nullLiteral.validate(null) === Ok(null)
```

### `unknown: Validator<unknown>`

Validates `unknown`, which means this validator is always successful

```ts
v.unknown.validate(null) === Ok(null)
v.unknown.validate(undefined) === Ok(undefined)
v.unknown.validate('a') === Ok('a')
```

### `never: Validator<never>`

Validates `never`, which means this validator is never successful.

```ts
v.never.validate(null) === Err(...)
v.never.validate(undefined) === Err(...)
v.never.validate('a') === Err(...)
```


## Validator Combinators

### `wrap<T>(name: string, validatorFunc: (input: unknown) => Result<T>): Validator<T>`

The most general combinator. Takes a function that converts from `unknown` to `Result<T>`.

```ts
const OnlyEven = v.wrap('OnlyEven', input => {
  return v.number.validate(input)
    .tryChange(n => n % 2 === 0 ? Ok(n) : Err('number must be even'))
})
```

### `wrapEnum<T>(name: string, validatorFunc: (input: unknown) => T | undefined): Validator<T>`

Given a function that returns a value of type `T` or `undefined`, creates a validator for `T`.

This function is mostly used by the `validator` macro for enums.

### `array<T>(validator: Validator<T>): Validator<T[]>`

Creates an array validator from an internal validator.

```ts
const NumberArray = v.array(v.number)
```

### `dictionary<T>(validator: Validator<T>): Validator<Dict<T>>`

Creates a validator of `{ [key: string]: T }` from an internal validator.

```ts
const NumberDict = v.dict(v.number)
```

This combinator is used to represent the `Dict` type from this library.

```ts
import { Dict } from '@blainehansen/validate'
// type Dict<T> = { [key: string]: T }

@validator!!()
type A = Dict<string>
// will generate:
namespace A {
  export const validator = v.dictionary(v.string)
}
```

### `record<K extends string | number | symbol, T>(keys: K[], validator: Validator<T>): Validator<Record<K, T>>`

Creates a `Record` validator.

```ts
@validator!!()
type A = Record<'a' | 'b' |'c', boolean>
// will generate:
namespace A {
  export const validator = v.record(['a', 'b', 'c'], v.boolean)
}
```

### `tuple<L extends any[]>(...validators: ValidatorTuple<L>): Validator<L>`

Creates a tuple validator from some set of internal validators.

```ts
const StrNumBool = v.tuple(v.string, v.number, v.boolean)
StrNumBool.validate(['a', 1, true]) === Ok(...)
```

### `spread<L extends any[], S extends any[]>(...args: [...ValidatorTuple<L>, Validator<S>]): Validator<[...L, ...S]>`

Described above. Mostly used by the `validator` macro.

### `object<O extends Dict<any>>(...args: [string, ValidatorObject<O>] | [ValidatorObject<O>]): Validator<O>`

Creates a validator specified by the shape of the incoming object.

```ts
const Person = v.object('Person', { name: v.string, height: v.number })
Person.validate({ name: 'Alice', height: 6 }) === Ok(...)
Person.validate({ name: 'Alice', height: 6, weight: 120 }) === Err("...")
```


### `union<L extends any[]>(...validators: ValidatorTuple<L>): Validator<L[number]>`

Creates a validator for the union type of all input validators.

```ts
const NumOrBoolOrStr = v.union(v.number, v.boolean, v.string)
// number | boolean | string
type NumOrBoolOrStr = v.TypeOf<typeof NumOrBoolOrStr>
const
NumOrBoolOrStr.validate(1) === Ok(1)
NumOrBoolOrStr.validate(true) === Ok(true)
NumOrBoolOrStr.validate('a') === Ok('a')
```

### `literal<V extends Primitives>(value: V): Validator<V>`

Creates a validator for an exact value. Must be `string | boolean | number | bigint | null | undefined | void`.

```ts
const OnlyOne = v.literal(1)
// 1
type OnlyOne = v.TypeOf<typeof OnlyOne>
const ok = OnlyOne.validate(1)
const err = OnlyOne.validate(2)
```

### `literals<L extends Primitives[]>(...values: L): Validator<L[number]>`

Creates a validator for the union of several exact values. Must all be `string | boolean | number | bigint | null | undefined | void`.

```ts
const OneOrAOrTru = v.literals(1, 'a', true)
// 1 | 'a' | true
type OnlyOne = v.TypeOf<typeof OnlyOne>
const ok = OnlyOne.validate(1)
const ok = OnlyOne.validate('a')
const ok = OnlyOne.validate(true)
const err = OnlyOne.validate(2)
```


### `optional<T>(validator: Validator<T>): Validator<T | undefined>`

Creates a validator for the optional version of the input validator.

```ts
v.optional(v.number)
```

### `nullable<T>(validator: Validator<T>): Validator<T | null>`

Creates a validator for the nullable version of the input validator.

```ts
v.nullable(v.number)
```

### `nillable<T>(validator: Validator<T>): Validator<T | null | undefined>`

Creates a validator for the nillable version of the input validator.

```ts
v.nillable(v.number)
```

### `maybe<T>(validator: Validator<T>): Validator<Maybe<T>>`

Creates a validator that can adapt `T | null | undefined` to [`Maybe<T>`](https://github.com/blainehansen/monads/blob/master/lib/maybe.md). This is mostly useful when nesting this validator within other structures.

```ts
import { Maybe, Some, None } from '@blainehansen/monads'
const MaybeNumber = v.maybe(v.number)
MaybeNumber.validate(1) === Ok(Some(1))
MaybeNumber.validate(null) === Ok(None)
MaybeNumber.validate(undefined) === Ok(None)

MaybeNumber.validate('a') === Err(...)

const Person = v.object({
  name: v.string,
  height: v.number,
  weight: MaybeNumber,
})

const ok = Person.validate({
  name: 'Alice',
  height: 2,
  weight: null,
})
ok === Ok({
  name: 'Alice',
  height: 2,
  weight: None,
})
```

If you find yourself in a situation where you'd like to validate a simple value to a `Maybe`, instead of trying to flatten or extract the maybe from the result, just validate and use the `okMaybe` method of `Result`, which converts `Ok` to `Some` and `Err` to `None`.

```ts
v.number
  .validate(process.env.CONFIG_NUMBER)
  .okMaybe()
  .match({
    some: n => console.log('Yay got a valid number!'),
    none: () => console.error('Boo number was invalid or not present!'),
  })
```

### `func<L extends any[], T>(fn: (...args: L) => T, argsValidator: Validator<L>): FunctionValidator<L, T>`

Described above. Mainly used in code generated by the `validator` macro.

```ts
class FunctionValidator<L extends any[], T> {
  readonly name: string
  readonly fn: (...args: L) => T,
  readonly argsValidator: Validator<L>,
  validateCall(input: unknown): Result<T>
}
```

### `recursive<T>(fn: () => Validator<T>): Validator<T>`

Allows for recursive type definitions. The `validator` macro can detect recursive types, so this will be used in code generation.

```ts
@validator!!()
type Category = {
  name: string,
  categories: Category[],
}
// will generate:
namespace Category {
  export const validator: v.Validator<Category> = v.object('Category', {
    name: v.string,
    categories: v.array(v.recursive(() => validator)),
  })
}
```

### `intersection<L extends any[]>(...validators: ValidatorTuple<L>): Validator<TupleIntersection<L>>`

Described above.

### `partial<T>(validator: Validator<T>): Validator<Partial<T>>`

### `required<T>(validator: Validator<T>): Validator<Required<T>>`

### `nonnullable<T>(validator: Validator<T>): Validator<NonNullable<T>>`

### `readonly<T>(validator: Validator<T>): Validator<Readonly<T>>`

### `pick<T, K extends keyof T>(validator: Validator<T>, ...keys: K[]): Validator<Pick<T, K>>`

### `omit<T, K extends keyof T>(validator: Validator<T>, ...keys: K[]): Validator<Omit<T, K>>`


## Adaptation/Conversion

Often we don't need input to be in exactly the form we expect, but can work with many different types. These adaptation helpers can create validators that are lenient and try multiple ways of producing the same thing.

### `adapt(validator: Validator<T>, ...adaptors: AdaptorTuple<T>)`

Produce an adapting validator from a base validator and some set of adaptors. Adaptors are functions that can convert to our goal of `T` through some other type `U`.

Adaptors can be both "safe", so never fail to convert from `T` to `U`; or they can be fallible, so they sometimes will fail and produce `Result<T>` instead.

When creating adaptors, we also have to provide `U`'s base validator, so we can attempt to go from `unknown` to `U`.

```ts
const LenientBool = v.adapt(
  v.boolean,
  // we can always get a boolean from a number
  v.adaptor(v.number, n => n === 0),
  // we can sometimes get a boolean from a string
  v.tryAdaptor(v.string, s => {
    if (s === 'true') return Ok(true)
    if (s === 'false') return Ok(false)
    return Err("couldn't convert from string to boolean")
  }),
)

LenientBool.validate(true) === Ok(true)
LenientBool.validate(false) === Ok(false)
LenientBool.validate(1) === Ok(true)
LenientBool.validate(0) === Ok(false)
LenientBool.validate('true') === Ok(true)
LenientBool.validate('false') === Ok(false)

LenientBool.validate('whatup') === Err(...)
```

### `adaptor<U, T>(validator: Validator<U>, func: (input: U) => T): SafeAdaptor<U, T>`

Creates an adaptor from `U` to `T` that never fails.

```ts
v.adaptor(v.number, n => n === 0)
```

### `tryAdaptor<U, T>(validator: Validator<U>, func: (input: U) => Result<T>): FallibleAdaptor<U, T>`

Creates an adaptor from `U` to `T` that can fail.

```ts
v.tryAdaptor(v.string, s => {
  if (s === 'true') return Ok(true)
  if (s === 'false') return Ok(false)
  return Err("couldn't convert from string to boolean")
})
```

# `validate`

A convenient typescript validation/decoding library with an accompanying helper macro.

Need to validate unknown input from the outside world, such as files, environment variables, or incoming http request bodies? This library gives a type-driven way to do so, either manually or with a [`macro-ts`](https://github.com/blainehansen/macro-ts) decorator macro. This library uses the safe [`Result` type from `@blainehansen/monads`](https://github.com/blainehansen/monads) to indicate success or failure rather than throwing exceptions.

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

// ... or manually...
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

The `validator` macro can automatically generate validators for most types, interfaces, and classes. However the typescript type system is extremely complex, so there are some types that will be rejected by the macro, and others that have some caveats.



### `validator` and Functions

When used on a function declaration, the `validator` macro produces a `FunctionValidator` instance. This allows you to call the function with unknown input, which will first be validated against the type of the function args before calling the actual function.

```ts
@validator!!()
function sillyFunction(left: string, right: number) {
  return left.length + right.length
}

sillyFunction.validateCaller.validateCall(someUnknownArgs)
```

When `validator` is used on a generic function, the return type must be annotated.

```ts
class FunctionValidator<L extends any[], T> {
  readonly name: string
  constructor(
    readonly fn: Func<L, T>,
    readonly argsValidator: Validator<L>,
  )
  validateCall(input: unknown): Result<T>
}
```

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

<!-- ### `type ValidatorTuple<L extends unknown[]>` -->

## Static Validators

### `string: Validator<string>`

Decodes strings.

```ts
v.string.validate('a') === Ok('a')
```

### `boolean: Validator<boolean>`

Decodes booleans.

```ts
v.boolean.validate(true) === Ok(true)
```

### `number: Validator<number>`

Decodes numbers. Doesn't allow any form of `NaN` or `Infinity`.

```ts
v.number.validate(1.1) === Ok(1.1)
```

### `looseNumber: Validator<number>`

Decodes numbers. Does allow any form of `NaN` or `Infinity`.

```ts
v.looseNumber.validate(NaN) === Ok(NaN)
```

### `int: Validator<number>`

Decodes numbers if they have no decimal component.

```ts
v.int.validate(-1) === Ok(-1)
```

### `uint: Validator<number>`

Decodes numbers if they have no decimal component and are positive.

```ts
v.uint.validate(1) === Ok(1)
```

### `undefinedLiteral: Validator<undefined>`

Decodes `undefined`.

```ts
v.undefinedLiteral.validate(undefined) === Ok(undefined)
```

### `nullLiteral: Validator<null>`

Decodes `null`.

```ts
v.nullLiteral.validate(null) === Ok(null)
```

### `unknown: Validator<unknown>`

Decodes `unknown`, which means this validator is always successful

```ts
v.unknown.validate(null) === Ok(null)
v.unknown.validate(undefined) === Ok(undefined)
v.unknown.validate('a') === Ok('a')
```

### `never: Validator<never>`

Decodes `never`, which means this validator is never successful.

```ts
v.never.validate(null) === Err(...)
v.never.validate(undefined) === Err(...)
v.never.validate('a') === Err(...)
```


## Validator Combinators

TODO for each of these, give some idea of how the same thing can be achieved with type aliases.

TODO
func
recursive
record
spread
intersection

partial
required
nonnullable
readonly
pick
omit

### `wrap<T>(name: string, validatorFunc: (input: unknown) => Result<T>): Validator<T>`

The most general combinator. Takes a function that converts from `unknown` to `Result<T>`.

```ts
const OnlyEven = v.wrap('OnlyEven', input => {
  return v.number.validate(input)
    .tryChange(n => n % 2 === 0 ? Ok(n) : Err('number must be even'))
})
```

### `wrapEnum<T>(name: string, validatorFunc: (input: unknown) => T | undefined): Validator<T>`


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

### `tuple<L extends unknown[]>(...validators: ValidatorTuple<L>): Validator<L>`

Creates a tuple validator from some set of internal validators.

```ts
const StrNumBool = v.tuple(v.string, v.number, v.boolean)
StrNumBool.validate(['a', 1, true]) === Ok(...)
```

### `object<O>(name: string, validators: ValidatorObject<O>): Validator<O>`

TODO
Creates a validator specified by the shape of the incoming object.

```ts
const Person = v.object('Person', { name: v.string, height: v.number })
Person.validate({ name: 'Alice', height: 6 }) === Ok(...)
Person.validate({ name: 'Alice', height: 6, weight: 120 }) === Err("...")
```


### `union(...validators: ValidatorTuple): Validator<T | U | ...>`

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

Creates a validator for an exact value. Must be `string | boolean | number | null | undefined`.

```ts
const OnlyOne = v.literal(1)
// 1
type OnlyOne = v.TypeOf<typeof OnlyOne>
const ok = OnlyOne.validate(1)
const err = OnlyOne.validate(2)
```

### `literals<V extends Primitives>(...values: V[]): Validator<V[0] | V[1] | ...>`

Creates a validator for the union of several exact values. Must all be `string | boolean | number | null | undefined`.

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

Creates a validator that can adapt `T | null | undefined` to `Maybe<T>`. This is mostly useful when nesting this validator within other structures.

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

## Serializable Classes

All the validators here are for "static" types, or things that simply describe their shape. What happens when you want a custom class to be decodable?

One way is to just have your class extend `Validator`:

```ts
class A { constructor(readonly name: string, height: ) }
```

However, with the `Codec` interface and the `cls` combinator, you can easily produce a class that is easy to encode and validate using the normal constructor for your class.

```ts
class A implements v.Codec {
  constructor(readonly x: number, readonly y: string) {}
  static validate = v.tuple(v.number, v.string)
  encode() {
    return t(this.x, this.y)
  }

  static validator: v.Validator<A> = v.cls(A)
}

const original = new A(1, 2)

const json = JSON.stringify(original.encode())
const validated =
  Result.attempt(() => JSON.parse(json))
  .tryChange(json => A.validator.validate(json))

validated === Ok(original)
```

### `cls<T extends Codec>(cn: CodecConstructor<T>): Validator<T>`

Creates a validator from a class that implements `Codec`.

### `interface Codec`

```ts
interface Codec<L extends unknown[] = unknown[]> {
  // new (...args: L): T
  static validator: Validator<L>
  encode(): L
}
```


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

Creates an adaptor from `U` to `T` that sometimes fails.

```ts
v.tryAdaptor(v.string, s => {
  if (s === 'true') return Ok(true)
  if (s === 'false') return Ok(false)
  return Err("couldn't convert from string to boolean")
})
```

<!-- ## Generic Serialization -->

<!-- ### `abstract class Serializer` -->
<!-- ### `class JsonSerializer extends Serializer` -->

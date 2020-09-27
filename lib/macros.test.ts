import * as c from './validate'
import { Dict } from './utils'
import { Result } from '@blainehansen/monads'
import { assertType as assert } from './utils.test'

@decodable!!()
type BasicPrimitive = string
assert.same<c.TypeOf<typeof BasicPrimitive.validator>, string>(true)


@decodable!!()
type PrimitiveArray = string[]
assert.same<c.TypeOf<typeof PrimitiveArray.validator>, string[]>(true)

@decodable!!()
type ArrayAsReference = Array<string>
assert.same<c.TypeOf<typeof ArrayAsReference.validator>, string[]>(true)

@decodable!!()
type PartialReference = Partial<{ a: string, b: number | undefined }>
assert.same<c.TypeOf<typeof PartialReference.validator>, Partial<{ a: string, b: number | undefined }>>(true)
assert.same<c.TypeOf<typeof PartialReference.validator>, { a?: string, b?: number | undefined }>(true)

@decodable!!()
type RequiredReference = Required<{ a: string, b?: number, c: boolean | undefined, d?: boolean | undefined }>
assert.same<c.TypeOf<typeof RequiredReference.validator>, Required<{ a: string, b?: number, c: boolean | undefined, d?: boolean | undefined }>>(true)
assert.same<c.TypeOf<typeof RequiredReference.validator>, { a: string, b: number, c: boolean | undefined, d: boolean }>(true)

@decodable!!()
type ReadonlyReference = Readonly<{ a: string, b: number }>
assert.same<c.TypeOf<typeof ReadonlyReference.validator>, Readonly<{ a: string, b: number }>>(true)
assert.same<c.TypeOf<typeof ReadonlyReference.validator>, { readonly a: string, readonly b: number }>(true)

@decodable!!()
type NonNullableReference = NonNullable<string | null | undefined>
assert.same<c.TypeOf<typeof NonNullableReference.validator>, NonNullable<string | null | undefined>>(true)
assert.same<c.TypeOf<typeof NonNullableReference.validator>, string>(true)

@decodable!!()
type DictReference = Dict<number>
assert.same<c.TypeOf<typeof DictReference.validator>, Dict<number>>(true)
assert.same<c.TypeOf<typeof DictReference.validator>, { [key: string]: number }>(true)

@decodable!!()
type PickAB = Pick<{ a: number, b: string, c: boolean }, 'a' | 'b'>
assert.same<c.TypeOf<typeof PickAB.validator>, Pick<{ a: number, b: string, c: boolean }, 'a' | 'b'>>(true)
assert.same<c.TypeOf<typeof PickAB.validator>, { a: number, b: string }>(true)

@decodable!!()
type PickA = Pick<{ a: number, b: string, c: boolean }, 'a'>
assert.same<c.TypeOf<typeof PickA.validator>, Pick<{ a: number, b: string, c: boolean }, 'a'>>(true)
assert.same<c.TypeOf<typeof PickA.validator>, { a: number }>(true)

@decodable!!()
type OmitAB = Omit<{ a: number, b: string, c: boolean }, 'a' | 'b'>
assert.same<c.TypeOf<typeof OmitAB.validator>, Omit<{ a: number, b: string, c: boolean }, 'a' | 'b'>>(true)
assert.same<c.TypeOf<typeof OmitAB.validator>, { c: boolean }>(true)

@decodable!!()
type OmitA = Omit<{ a: number, b: string, c: boolean }, 'a'>
assert.same<c.TypeOf<typeof OmitA.validator>, Omit<{ a: number, b: string, c: boolean }, 'a'>>(true)
assert.same<c.TypeOf<typeof OmitA.validator>, { b: string, c: boolean }>(true)

@decodable!!()
type RecordAB = Record<'a' | 'b', string>
assert.same<c.TypeOf<typeof RecordAB.validator>, Record<'a' | 'b', string>>(true)
assert.same<c.TypeOf<typeof RecordAB.validator>, { a: string, b: string }>(true)

@decodable!!()
type RecordA = Record<'a', string>
assert.same<c.TypeOf<typeof RecordA.validator>, Record<'a', string>>(true)
assert.same<c.TypeOf<typeof RecordA.validator>, { a: string }>(true)

@decodable!!()
type ReferenceArray = BasicPrimitive[]
assert.same<c.TypeOf<typeof ReferenceArray.validator>, BasicPrimitive[]>(true)
assert.same<c.TypeOf<typeof ReferenceArray.validator>, string[]>(true)

@decodable!!()
type ObjectArray = { a: string }[]
assert.same<c.TypeOf<typeof ObjectArray.validator>, { a: string }[]>(true)

@decodable!!()
type UnionArray = (string | boolean)[]
assert.same<c.TypeOf<typeof UnionArray.validator>, (string | boolean)[]>(true)


@decodable!!()
type SimpleObject = { b: number }
assert.same<c.TypeOf<typeof SimpleObject.validator>, { b: number }>(true)

@decodable!!()
type NestedObject = { b: number, c: { s: string } }
assert.same<c.TypeOf<typeof NestedObject.validator>, { b: number, c: { s: string } }>(true)

@decodable!!()
type ObjectWithOptionals = { b: number, c?: boolean }
assert.same<c.TypeOf<typeof ObjectWithOptionals.validator>, { b: number, c?: boolean }>(true)


@decodable!!()
type SimpleUnion = string | boolean | { n: number }
assert.same<c.TypeOf<typeof SimpleUnion.validator>, string | boolean | { n: number }>(true)

@decodable!!()
type DiscriminatedUnion = { ok: true, value: string } | { ok: false, error: string }
assert.same<c.TypeOf<typeof DiscriminatedUnion.validator>, { ok: true, value: string } | { ok: false, error: string }>(true)

@decodable!!()
type StringConstant = 'a'
assert.same<c.TypeOf<typeof StringConstant.validator>, 'a'>(true)

@decodable!!()
type NumericConstant = 1
assert.same<c.TypeOf<typeof NumericConstant.validator>, 1>(true)

@decodable!!()
type BigIntConstant = 10000n
assert.same<c.TypeOf<typeof BigIntConstant.validator>, 10000n>(true)

@decodable!!()
type TrueConstant = true
assert.same<c.TypeOf<typeof TrueConstant.validator>, true>(true)

@decodable!!()
type FalseConstant = false
assert.same<c.TypeOf<typeof FalseConstant.validator>, false>(true)

@decodable!!()
type NullConstant = null
assert.same<c.TypeOf<typeof NullConstant.validator>, null>(true)

@decodable!!()
type UndefinedConstant = undefined
assert.same<c.TypeOf<typeof UndefinedConstant.validator>, undefined>(true)

@decodable!!()
type VoidConstant = void
assert.same<c.TypeOf<typeof VoidConstant.validator>, void>(true)

@decodable!!()
type NeverConstant = never
assert.same<c.TypeOf<typeof NeverConstant.validator>, never>(true)

@decodable!!()
type UnknownConstant = unknown
assert.same<c.TypeOf<typeof UnknownConstant.validator>, unknown>(true)

@decodable!!()
type ConstantUnion = 'a' | 1 | true | null | undefined
assert.same<c.TypeOf<typeof ConstantUnion.validator>, 'a' | 1 | true | null | undefined>(true)

@decodable!!()
type SimpleTuple = [number, boolean]
assert.same<c.TypeOf<typeof SimpleTuple.validator>, [number, boolean]>(true)

@decodable!!()
type TupleWithOptionals = [number, boolean?]
assert.same<c.TypeOf<typeof TupleWithOptionals.validator>, [number, boolean?]>(true)

@decodable!!()
type TupleWithSpread = [number, ...boolean[]]
assert.same<c.TypeOf<typeof TupleWithSpread.validator>, [number, ...boolean[]]>(true)


@decodable!!()
type SaneIntersection = { a: string } & { b: boolean }
assert.same<c.TypeOf<typeof SaneIntersection.validator>, { a: string } & { b: boolean }>(true)

@decodable!!()
type ArrayIntersection = string[] & { b: boolean }
assert.same<c.TypeOf<typeof ArrayIntersection.validator>, string[] & { b: boolean }>(true)

@decodable!!()
export type BadIntersection = string & number
assert.same<c.TypeOf<typeof BadIntersection.validator>, string & number>(true)
assert.never<c.TypeOf<typeof BadIntersection.validator>>(true)


@decodable!!()
type G<L, R> = { left: L, right: R }
assert.same<typeof G.validator, <L, R>(left: c.Validator<L>, right: c.Validator<R>) => c.Validator<G<L, R>>>(true)

@decodable!!()
type GStringBoolean = G<string, number>
assert.same<c.TypeOf<typeof GStringBoolean.validator>, { left: string, right: number }>(true)

@decodable!!()
type GPrimBoolean = G<PrimitiveArray, boolean>
assert.same<c.TypeOf<typeof GPrimBoolean.validator>, { left: string[], right: boolean }>(true)


// @decodable!!()
// export type BasicFunc = (a: string, b: boolean) => number
// assert.same<typeof BasicFunc.validator, (fn: BasicFunc) => c.Validator<number>>(true)

// @decodable!!()
// type GenericFunc<T, U> = (a: T, b: boolean) => U
// assert.same<typeof GenericFunc.validator, <T, U>(T: c.Validator<T>, U: c.Validator<U>) => (fn: GenericFunc<T, U>) => c.Validator<U>>(true)


@decodable!!()
export interface BasicInterface { a: string }
assert.same<c.TypeOf<typeof BasicInterface.validator>, { a: string }>(true)
assert.same<c.TypeOf<typeof BasicInterface.validator>, BasicInterface>(true)

@decodable!!()
interface InterfaceArray extends UnionArray, NestedObject { a: string }
assert.same<c.TypeOf<typeof InterfaceArray.validator>, { a: string } & UnionArray & NestedObject>(true)
assert.same<c.TypeOf<typeof InterfaceArray.validator>, InterfaceArray>(true)


@decodable!!()
class BasicClass {
  c: boolean
  constructor(
    readonly a: string,
    public b: boolean,
    c: number,
  ) { this.c = c === 0 }
}
assert.same<c.TypeOf<typeof BasicClass.validator>, BasicClass>(true)

@decodable!!()
class GenericClass<L, R> {
 constructor(
   readonly left: L,
   readonly right: R,
 ) {}
}
assert.same<typeof GenericClass.validator, <L, R>(left: c.Validator<L>, right: c.Validator<R>) => c.Validator<GenericClass<L, R>>>(true)

@decodable!!()
class GenericClassSpread<L, R extends any[]> {
  right: R
 constructor(
   readonly left: L,
   ...right: R,
 ) { this.right = right }
}
assert.same<typeof GenericClassSpread.validator, <L, R extends any[]>(left: c.Validator<L>, right: c.Validator<R>) => c.Validator<GenericClassSpread<L, R>>>(true)

// TODO does the failure here mean this variety just isn't realistic?
// @decodable!!()
// class ComplexClass extends BasicClass {
//  constructor(
//    a: string,
//    b: boolean,
//    c: number,
//    readonly stuff: { a: number }[],
//  ) { super(a, b, c) }
// }
// assert.same<c.TypeOf<typeof ComplexClass.validator>, [string, boolean, number, { a: number }[]]>(true)


// @decodable!!()
// export class ConstructorLessClass extends BasicClass {
//  yoyo() { return this.b && this.c }
// }
// assert.same<c.TypeOf<typeof ConstructorLessClass.validator>, [string, boolean, number]>(true)


@decodable!!()
function basicFunction(a: string, b: { c: boolean[] }) { return 'a' as const }
assert.same<c.TypeOf<typeof basicFunction.validateCaller.argsValidator>, [string, { c: boolean[] }]>(true)
assert.same<typeof basicFunction.validateCaller.validateCall, (input: unknown) => Result<'a'>>(true)
assert.same<typeof basicFunction.validateCaller.fn, (a: string, b: { c: boolean[] }) => 'a'>(true)

@decodable!!()
export function functionGeneric<T>(a: T, ...ns: number[]): T { return a }
assert.same<typeof functionGeneric.validateCaller, <T>(T: c.Validator<T>) => c.FunctionValidator<[T, ...number[]], T>>(true)

@decodable!!()
function functionWithOptional(a: string, c?: number) { return 'b' as const }
assert.same<c.TypeOf<typeof functionWithOptional.validateCaller.argsValidator>, [string, number?]>(true)
assert.same<typeof functionWithOptional.validateCaller.validateCall, (input: unknown) => Result<'b'>>(true)
assert.same<typeof functionWithOptional.validateCaller.fn, (a: string, c?: number) => 'b'>(true)

@decodable!!()
function functionWithDefault(a: string, c: number = 1) { return 'c' as const }
assert.same<c.TypeOf<typeof functionWithDefault.validateCaller.argsValidator>, [string, number?]>(true)
assert.same<typeof functionWithDefault.validateCaller.validateCall, (input: unknown) => Result<'c'>>(true)
assert.same<typeof functionWithDefault.validateCaller.fn, (a: string, c?: number) => 'c'>(true)

@decodable!!()
export function functionWithSpread(a: string, ...ns: number[]) { return 'd' as const }
assert.same<c.TypeOf<typeof functionWithSpread.validateCaller.argsValidator>, [string, ...number[]]>(true)
assert.same<typeof functionWithSpread.validateCaller.validateCall, (input: unknown) => Result<'d'>>(true)
assert.same<typeof functionWithSpread.validateCaller.fn, (a: string, ...ns: number[]) => 'd'>(true)


@decodable!!()
enum NumericEnum { a, b, c }
assert.same<c.TypeOf<typeof NumericEnum.validator>, NumericEnum>(true)

@decodable!!()
enum SpecifiedNumericEnum { a = 2, b = 3, c = 4 }
assert.same<c.TypeOf<typeof SpecifiedNumericEnum.validator>, SpecifiedNumericEnum>(true)

@decodable!!()
enum InitializedNumericEnum { a = 2, b, c }
assert.same<c.TypeOf<typeof InitializedNumericEnum.validator>, InitializedNumericEnum>(true)

@decodable!!()
enum Yoyoyoyo { a = 'a', b = 'b', c = 'c' }
assert.same<c.TypeOf<typeof Yoyoyoyo.validator>, Yoyoyoyo>(true)

@decodable!!()
export enum HeterogeneousEnum { a = 2, b = 'b', c = 5 }
assert.same<c.TypeOf<typeof HeterogeneousEnum.validator>, HeterogeneousEnum>(true)


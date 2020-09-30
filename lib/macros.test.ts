import * as v from './validate'
import { Dict } from './utils'
import { Result } from '@blainehansen/monads'
import { assertType as assert } from './utils.test'

@validator!!()
type BasicPrimitive = string
assert.same<v.TypeOf<typeof BasicPrimitive.validator>, string>(true)


@validator!!()
type PrimitiveArray = string[]
assert.same<v.TypeOf<typeof PrimitiveArray.validator>, string[]>(true)

@validator!!()
type ArrayAsReference = Array<string>
assert.same<v.TypeOf<typeof ArrayAsReference.validator>, string[]>(true)

@validator!!()
type PartialReference = Partial<{ a: string, b: number | undefined }>
assert.same<v.TypeOf<typeof PartialReference.validator>, Partial<{ a: string, b: number | undefined }>>(true)
assert.same<v.TypeOf<typeof PartialReference.validator>, { a?: string, b?: number | undefined }>(true)

@validator!!()
type RequiredReference = Required<{ a: string, b?: number, c: boolean | undefined, d?: boolean | undefined }>
assert.same<v.TypeOf<typeof RequiredReference.validator>, Required<{ a: string, b?: number, c: boolean | undefined, d?: boolean | undefined }>>(true)
assert.same<v.TypeOf<typeof RequiredReference.validator>, { a: string, b: number, c: boolean | undefined, d: boolean }>(true)

@validator!!()
type ReadonlyReference = Readonly<{ a: string, b: number }>
assert.same<v.TypeOf<typeof ReadonlyReference.validator>, Readonly<{ a: string, b: number }>>(true)
assert.same<v.TypeOf<typeof ReadonlyReference.validator>, { readonly a: string, readonly b: number }>(true)

@validator!!()
type NonNullableReference = NonNullable<string | null | undefined>
assert.same<v.TypeOf<typeof NonNullableReference.validator>, NonNullable<string | null | undefined>>(true)
assert.same<v.TypeOf<typeof NonNullableReference.validator>, string>(true)

@validator!!()
type DictReference = Dict<number>
assert.same<v.TypeOf<typeof DictReference.validator>, Dict<number>>(true)
assert.same<v.TypeOf<typeof DictReference.validator>, { [key: string]: number }>(true)

@validator!!()
type PickAB = Pick<{ a: number, b: string, c: boolean }, 'a' | 'b'>
assert.same<v.TypeOf<typeof PickAB.validator>, Pick<{ a: number, b: string, c: boolean }, 'a' | 'b'>>(true)
assert.same<v.TypeOf<typeof PickAB.validator>, { a: number, b: string }>(true)

@validator!!()
type PickA = Pick<{ a: number, b: string, c: boolean }, 'a'>
assert.same<v.TypeOf<typeof PickA.validator>, Pick<{ a: number, b: string, c: boolean }, 'a'>>(true)
assert.same<v.TypeOf<typeof PickA.validator>, { a: number }>(true)

@validator!!()
type OmitAB = Omit<{ a: number, b: string, c: boolean }, 'a' | 'b'>
assert.same<v.TypeOf<typeof OmitAB.validator>, Omit<{ a: number, b: string, c: boolean }, 'a' | 'b'>>(true)
assert.same<v.TypeOf<typeof OmitAB.validator>, { c: boolean }>(true)

@validator!!()
type OmitA = Omit<{ a: number, b: string, c: boolean }, 'a'>
assert.same<v.TypeOf<typeof OmitA.validator>, Omit<{ a: number, b: string, c: boolean }, 'a'>>(true)
assert.same<v.TypeOf<typeof OmitA.validator>, { b: string, c: boolean }>(true)

@validator!!()
type RecordAB = Record<'a' | 'b', string>
assert.same<v.TypeOf<typeof RecordAB.validator>, Record<'a' | 'b', string>>(true)
assert.same<v.TypeOf<typeof RecordAB.validator>, { a: string, b: string }>(true)

@validator!!()
type RecordA = Record<'a', string>
assert.same<v.TypeOf<typeof RecordA.validator>, Record<'a', string>>(true)
assert.same<v.TypeOf<typeof RecordA.validator>, { a: string }>(true)

@validator!!()
type ReferenceArray = BasicPrimitive[]
assert.same<v.TypeOf<typeof ReferenceArray.validator>, BasicPrimitive[]>(true)
assert.same<v.TypeOf<typeof ReferenceArray.validator>, string[]>(true)

@validator!!()
type ObjectArray = { a: string }[]
assert.same<v.TypeOf<typeof ObjectArray.validator>, { a: string }[]>(true)

@validator!!()
type UnionArray = (string | boolean)[]
assert.same<v.TypeOf<typeof UnionArray.validator>, (string | boolean)[]>(true)


@validator!!()
type SimpleObject = { b: number }
assert.same<v.TypeOf<typeof SimpleObject.validator>, { b: number }>(true)

@validator!!()
type NestedObject = { b: number, c: { s: string } }
assert.same<v.TypeOf<typeof NestedObject.validator>, { b: number, c: { s: string } }>(true)

@validator!!()
type ObjectWithOptionals = { b: number, c?: boolean }
assert.same<v.TypeOf<typeof ObjectWithOptionals.validator>, { b: number, c?: boolean }>(true)


@validator!!()
type SimpleUnion = string | boolean | { n: number }
assert.same<v.TypeOf<typeof SimpleUnion.validator>, string | boolean | { n: number }>(true)

@validator!!()
type DiscriminatedUnion = { ok: true, value: string } | { ok: false, error: string }
assert.same<v.TypeOf<typeof DiscriminatedUnion.validator>, { ok: true, value: string } | { ok: false, error: string }>(true)

@validator!!()
type StringConstant = 'a'
assert.same<v.TypeOf<typeof StringConstant.validator>, 'a'>(true)

@validator!!()
type NumericConstant = 1
assert.same<v.TypeOf<typeof NumericConstant.validator>, 1>(true)

@validator!!()
type BigIntConstant = 10000n
assert.same<v.TypeOf<typeof BigIntConstant.validator>, 10000n>(true)

@validator!!()
type TrueConstant = true
assert.same<v.TypeOf<typeof TrueConstant.validator>, true>(true)

@validator!!()
type FalseConstant = false
assert.same<v.TypeOf<typeof FalseConstant.validator>, false>(true)

@validator!!()
type NullConstant = null
assert.same<v.TypeOf<typeof NullConstant.validator>, null>(true)

@validator!!()
type UndefinedConstant = undefined
assert.same<v.TypeOf<typeof UndefinedConstant.validator>, undefined>(true)

@validator!!()
type VoidConstant = void
assert.same<v.TypeOf<typeof VoidConstant.validator>, void>(true)

@validator!!()
type NeverConstant = never
assert.same<v.TypeOf<typeof NeverConstant.validator>, never>(true)

@validator!!()
type UnknownConstant = unknown
assert.same<v.TypeOf<typeof UnknownConstant.validator>, unknown>(true)

@validator!!()
type ConstantUnion = 'a' | 1 | true | null | undefined
assert.same<v.TypeOf<typeof ConstantUnion.validator>, 'a' | 1 | true | null | undefined>(true)

@validator!!()
type SimpleTuple = [number, boolean]
assert.same<v.TypeOf<typeof SimpleTuple.validator>, [number, boolean]>(true)

@validator!!()
type TupleWithOptionals = [number, boolean?]
assert.same<v.TypeOf<typeof TupleWithOptionals.validator>, [number, boolean?]>(true)

@validator!!()
type TupleWithSpread = [number, ...boolean[]]
assert.same<v.TypeOf<typeof TupleWithSpread.validator>, [number, ...boolean[]]>(true)


@validator!!()
type SaneIntersection = { a: string } & { b: boolean }
assert.same<v.TypeOf<typeof SaneIntersection.validator>, { a: string } & { b: boolean }>(true)

@validator!!()
type ArrayIntersection = string[] & { b: boolean }
assert.same<v.TypeOf<typeof ArrayIntersection.validator>, string[] & { b: boolean }>(true)

@validator!!()
export type BadIntersection = string & number
assert.same<v.TypeOf<typeof BadIntersection.validator>, string & number>(true)
assert.never<v.TypeOf<typeof BadIntersection.validator>>(true)


@validator!!()
type G<L, R> = { left: L, right: R }
assert.same<typeof G.validator, <L, R>(left: v.Validator<L>, right: v.Validator<R>) => v.Validator<G<L, R>>>(true)

@validator!!()
type GStringBoolean = G<string, number>
assert.same<v.TypeOf<typeof GStringBoolean.validator>, { left: string, right: number }>(true)

@validator!!()
type GPrimBoolean = G<PrimitiveArray, boolean>
assert.same<v.TypeOf<typeof GPrimBoolean.validator>, { left: string[], right: boolean }>(true)


// @validator!!()
// export type BasicFunc = (a: string, b: boolean) => number
// assert.same<typeof BasicFunv.validator, (fn: BasicFunc) => v.Validator<number>>(true)

// @validator!!()
// type GenericFunc<T, U> = (a: T, b: boolean) => U
// assert.same<typeof GenericFunv.validator, <T, U>(T: v.Validator<T>, U: v.Validator<U>) => (fn: GenericFunc<T, U>) => v.Validator<U>>(true)


@validator!!()
export interface BasicInterface { a: string }
assert.same<v.TypeOf<typeof BasicInterface.validator>, { a: string }>(true)
assert.same<v.TypeOf<typeof BasicInterface.validator>, BasicInterface>(true)

@validator!!()
interface InterfaceArray extends UnionArray, NestedObject { a: string }
assert.same<v.TypeOf<typeof InterfaceArray.validator>, { a: string } & UnionArray & NestedObject>(true)
assert.same<v.TypeOf<typeof InterfaceArray.validator>, InterfaceArray>(true)


@validator!!()
class BasicClass {
  c: boolean
  constructor(
    readonly a: string,
    public b: boolean,
    c: number,
  ) { this.c = c === 0 }
}
assert.same<v.TypeOf<typeof BasicClass.validator>, BasicClass>(true)

@validator!!()
class GenericClass<L, R> {
 constructor(
   readonly left: L,
   readonly right: R,
 ) {}
}
assert.same<typeof GenericClass.validator, <L, R>(left: v.Validator<L>, right: v.Validator<R>) => v.Validator<GenericClass<L, R>>>(true)

@validator!!()
class GenericClassSpread<L, R extends any[]> {
  right: R
 constructor(
   readonly left: L,
   ...right: R,
 ) { this.right = right }
}
assert.same<typeof GenericClassSpread.validator, <L, R extends any[]>(left: v.Validator<L>, right: v.Validator<R>) => v.Validator<GenericClassSpread<L, R>>>(true)

// TODO does the failure here mean this variety just isn't realistic?
// @validator!!()
// class ComplexClass extends BasicClass {
//  constructor(
//    a: string,
//    b: boolean,
//    c: number,
//    readonly stuff: { a: number }[],
//  ) { super(a, b, c) }
// }
// assert.same<v.TypeOf<typeof ComplexClass.validator>, [string, boolean, number, { a: number }[]]>(true)


// @validator!!()
// export class ConstructorLessClass extends BasicClass {
//  yoyo() { return this.b && this.c }
// }
// assert.same<v.TypeOf<typeof ConstructorLessClass.validator>, [string, boolean, number]>(true)


@validator!!()
function basicFunction(a: string, b: { c: boolean[] }) { return 'a' as const }
assert.same<v.TypeOf<typeof basicFunction.validateCaller.argsValidator>, [string, { c: boolean[] }]>(true)
assert.same<typeof basicFunction.validateCaller.validateCall, (input: unknown) => Result<'a'>>(true)
assert.same<typeof basicFunction.validateCaller.fn, (a: string, b: { c: boolean[] }) => 'a'>(true)

@validator!!()
export function functionGeneric<T>(a: T, ...ns: number[]): T { return a }
assert.same<typeof functionGeneric.validateCaller, <T>(T: v.Validator<T>) => v.FunctionValidator<[T, ...number[]], T>>(true)

@validator!!()
function functionWithOptional(a: string, c?: number) { return 'b' as const }
assert.same<v.TypeOf<typeof functionWithOptional.validateCaller.argsValidator>, [string, number?]>(true)
assert.same<typeof functionWithOptional.validateCaller.validateCall, (input: unknown) => Result<'b'>>(true)
assert.same<typeof functionWithOptional.validateCaller.fn, (a: string, c?: number) => 'b'>(true)

@validator!!()
function functionWithDefault(a: string, c: number = 1) { return 'c' as const }
assert.same<v.TypeOf<typeof functionWithDefault.validateCaller.argsValidator>, [string, number?]>(true)
assert.same<typeof functionWithDefault.validateCaller.validateCall, (input: unknown) => Result<'c'>>(true)
assert.same<typeof functionWithDefault.validateCaller.fn, (a: string, c?: number) => 'c'>(true)

@validator!!()
export function functionWithSpread(a: string, ...ns: number[]) { return 'd' as const }
assert.same<v.TypeOf<typeof functionWithSpread.validateCaller.argsValidator>, [string, ...number[]]>(true)
assert.same<typeof functionWithSpread.validateCaller.validateCall, (input: unknown) => Result<'d'>>(true)
assert.same<typeof functionWithSpread.validateCaller.fn, (a: string, ...ns: number[]) => 'd'>(true)


@validator!!()
enum NumericEnum { a, b, c }
assert.same<v.TypeOf<typeof NumericEnum.validator>, NumericEnum>(true)

@validator!!()
enum SpecifiedNumericEnum { a = 2, b = 3, c = 4 }
assert.same<v.TypeOf<typeof SpecifiedNumericEnum.validator>, SpecifiedNumericEnum>(true)

@validator!!()
enum InitializedNumericEnum { a = 2, b, c }
assert.same<v.TypeOf<typeof InitializedNumericEnum.validator>, InitializedNumericEnum>(true)

@validator!!()
enum Yoyoyoyo { a = 'a', b = 'b', c = 'c' }
assert.same<v.TypeOf<typeof Yoyoyoyo.validator>, Yoyoyoyo>(true)

@validator!!()
export enum HeterogeneousEnum { a = 2, b = 'b', c = 5 }
assert.same<v.TypeOf<typeof HeterogeneousEnum.validator>, HeterogeneousEnum>(true)


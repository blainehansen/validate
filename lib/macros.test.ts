import * as c from './decode'
import { assertType as assert } from './utils.test'

@decodable!!()
type BasicPrimitive = string
assert.same<c.TypeOf<typeof BasicPrimitive.decoder>, string>(true)


@decodable!!()
type PrimitiveArray = string[]
assert.same<c.TypeOf<typeof PrimitiveArray.decoder>, string[]>(true)

@decodable!!()
type ArrayAsReference = Array<string>
assert.same<c.TypeOf<typeof ArrayAsReference.decoder>, string[]>(true)

@decodable!!()
type ReferenceArray = BasicPrimitive[]
assert.same<c.TypeOf<typeof ReferenceArray.decoder>, BasicPrimitive[]>(true)
assert.same<c.TypeOf<typeof ReferenceArray.decoder>, string[]>(true)

@decodable!!()
type ObjectArray = { a: string }[]
assert.same<c.TypeOf<typeof ObjectArray.decoder>, { a: string }[]>(true)

@decodable!!()
type UnionArray = (string | boolean)[]
assert.same<c.TypeOf<typeof UnionArray.decoder>, (string | boolean)[]>(true)


@decodable!!()
type SimpleObject = { b: number }
assert.same<c.TypeOf<typeof SimpleObject.decoder>, { b: number }>(true)

@decodable!!()
type NestedObject = { b: number, c: { s: string } }
assert.same<c.TypeOf<typeof NestedObject.decoder>, { b: number, c: { s: string } }>(true)

@decodable!!()
type ObjectWithOptionals = { b: number, c?: boolean }
assert.same<c.TypeOf<typeof ObjectWithOptionals.decoder>, { b: number, c?: boolean }>(true)


@decodable!!()
type SimpleUnion = string | boolean | { n: number }
assert.same<c.TypeOf<typeof SimpleUnion.decoder>, string | boolean | { n: number }>(true)

@decodable!!()
type DiscriminatedUnion = { ok: true, value: string } | { ok: false, error: string }
assert.same<c.TypeOf<typeof DiscriminatedUnion.decoder>, { ok: true, value: string } | { ok: false, error: string }>(true)

@decodable!!()
type StringConstant = 'a'
assert.same<c.TypeOf<typeof StringConstant.decoder>, 'a'>(true)

@decodable!!()
type NumericConstant = 1
assert.same<c.TypeOf<typeof NumericConstant.decoder>, 1>(true)

@decodable!!()
type BigIntConstant = 10000n
assert.same<c.TypeOf<typeof BigIntConstant.decoder>, 10000n>(true)

@decodable!!()
type TrueConstant = true
assert.same<c.TypeOf<typeof TrueConstant.decoder>, true>(true)

@decodable!!()
type FalseConstant = false
assert.same<c.TypeOf<typeof FalseConstant.decoder>, false>(true)

@decodable!!()
type NullConstant = null
assert.same<c.TypeOf<typeof NullConstant.decoder>, null>(true)

@decodable!!()
type UndefinedConstant = undefined
assert.same<c.TypeOf<typeof UndefinedConstant.decoder>, undefined>(true)

@decodable!!()
type VoidConstant = void
assert.same<c.TypeOf<typeof VoidConstant.decoder>, void>(true)

@decodable!!()
type NeverConstant = never
assert.same<c.TypeOf<typeof NeverConstant.decoder>, never>(true)

@decodable!!()
type UnknownConstant = unknown
assert.same<c.TypeOf<typeof UnknownConstant.decoder>, unknown>(true)

@decodable!!()
type ConstantUnion = 'a' | 1 | true | null | undefined
assert.same<c.TypeOf<typeof ConstantUnion.decoder>, 'a' | 1 | true | null | undefined>(true)

@decodable!!()
type SimpleTuple = [number, boolean]
assert.same<c.TypeOf<typeof SimpleTuple.decoder>, [number, boolean]>(true)

@decodable!!()
type TupleWithOptionals = [number, boolean?]
assert.same<c.TypeOf<typeof TupleWithOptionals.decoder>, [number, boolean?]>(true)

@decodable!!()
type TupleWithSpread = [number, ...boolean[]]
assert.same<c.TypeOf<typeof TupleWithSpread.decoder>, [number, ...boolean[]]>(true)


@decodable!!()
type SaneIntersection = { a: string } & { b: boolean }
assert.same<c.TypeOf<typeof SaneIntersection.decoder>, { a: string } & { b: boolean }>(true)

@decodable!!()
type ArrayIntersection = string[] & { b: boolean }
assert.same<c.TypeOf<typeof ArrayIntersection.decoder>, string[] & { b: boolean }>(true)

@decodable!!()
export type BadIntersection = string & number
assert.same<c.TypeOf<typeof BadIntersection.decoder>, string & number>(true)
assert.never<c.TypeOf<typeof BadIntersection.decoder>>(true)


@decodable!!()
type G<L, R> = { left: L, right: R }
assert.same<typeof G.decoder, <L, R>(left: c.Decoder<L>, right: c.Decoder<R>) => c.Decoder<G<L, R>>>(true)

@decodable!!()
type GStringBoolean = G<string, number>
assert.same<c.TypeOf<typeof GStringBoolean.decoder>, { left: string, right: number }>(true)

@decodable!!()
type GPrimBoolean = G<PrimitiveArray, boolean>
assert.same<c.TypeOf<typeof GPrimBoolean.decoder>, { left: string[], right: boolean }>(true)


// @decodable!!()
// export type BasicFunc = (a: string, b: boolean) => number
// assert.same<typeof BasicFunc.decoder, (fn: BasicFunc) => c.Decoder<number>>(true)

// @decodable!!()
// type GenericFunc<T, U> = (a: T, b: boolean) => U
// assert.same<typeof GenericFunc.decoder, <T, U>(T: c.Decoder<T>, U: c.Decoder<U>) => (fn: GenericFunc<T, U>) => c.Decoder<U>>(true)


@decodable!!()
export interface BasicInterface { a: string }
assert.same<c.TypeOf<typeof BasicInterface.decoder>, { a: string }>(true)
assert.same<c.TypeOf<typeof BasicInterface.decoder>, BasicInterface>(true)

@decodable!!()
interface InterfaceArray extends UnionArray, NestedObject { a: string }
assert.same<c.TypeOf<typeof InterfaceArray.decoder>, { a: string } & UnionArray & NestedObject>(true)
assert.same<c.TypeOf<typeof InterfaceArray.decoder>, InterfaceArray>(true)


@decodable!!()
class BasicClass {
  c: boolean
  constructor(
    readonly a: string,
    public b: boolean,
    c: number,
  ) { this.c = c === 0 }
}
assert.same<c.TypeOf<typeof BasicClass.decoder>, BasicClass>(true)

@decodable!!()
class GenericClass<L, R> {
 constructor(
   readonly left: L,
   readonly right: R,
 ) {}
}
assert.same<typeof GenericClass.decoder, <L, R>(left: c.Decoder<L>, right: c.Decoder<R>) => c.Decoder<GenericClass<L, R>>>(true)

@decodable!!()
class GenericClassSpread<L, R extends any[]> {
  right: R
 constructor(
   readonly left: L,
   ...right: R,
 ) { this.right = right }
}
assert.same<typeof GenericClassSpread.decoder, <L, R extends any[]>(left: c.Decoder<L>, right: c.Decoder<R>) => c.Decoder<GenericClassSpread<L, R>>>(true)

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
// assert.same<c.TypeOf<typeof ComplexClass.decoder>, [string, boolean, number, { a: number }[]]>(true)


// @decodable!!()
// export class ConstructorLessClass extends BasicClass {
//  yoyo() { return this.b && this.c }
// }
// assert.same<c.TypeOf<typeof ConstructorLessClass.decoder>, [string, boolean, number]>(true)


@decodable!!()
function basicFunction(a: string, b: { c: boolean[] }) { return 'a' as const }
// assert.same<c.TypeOf<typeof basicFunction.decoder>, [string, { c: boolean[] }]>(true)
assert.same<c.TypeOf<typeof basicFunction.decoder>, ReturnType<typeof basicFunction>>(true)
assert.same<c.TypeOf<typeof basicFunction.decoder>, 'a'>(true)

@decodable!!()
export function functionGeneric<T>(a: T, ...ns: number[]): T { return a }
// const n: typeof functionGeneric.decoder = undefined
assert.same<typeof functionGeneric.decoder, <T>(T: c.Decoder<T>) => c.Decoder<T>>(true)

@decodable!!()
function functionWithOptional(a: string, c?: number) { return 'b' as const }
// assert.same<c.TypeOf<typeof functionWithOptional.decoder>, [string, number?]>(true)
assert.same<c.TypeOf<typeof functionWithOptional.decoder>, ReturnType<typeof functionWithOptional>>(true)
assert.same<c.TypeOf<typeof functionWithOptional.decoder>, 'b'>(true)

@decodable!!()
function functionWithDefault(a: string, c: number = 1) { return 'c' as const }
// assert.same<c.TypeOf<typeof functionWithDefault.decoder>, [string, number?]>(true)
assert.same<c.TypeOf<typeof functionWithDefault.decoder>, ReturnType<typeof functionWithDefault>>(true)
assert.same<c.TypeOf<typeof functionWithDefault.decoder>, 'c'>(true)

@decodable!!()
export function functionWithSpread(a: string, ...ns: number[]) { return 'd' as const }
// assert.same<c.TypeOf<typeof functionWithSpread.decoder>, [string, ...number[]]>(true)
assert.same<c.TypeOf<typeof functionWithSpread.decoder>, ReturnType<typeof functionWithSpread>>(true)
assert.same<c.TypeOf<typeof functionWithSpread.decoder>, 'd'>(true)


@decodable!!()
enum NumericEnum { a, b, c }
assert.same<c.TypeOf<typeof NumericEnum.decoder>, NumericEnum>(true)

@decodable!!()
enum SpecifiedNumericEnum { a = 2, b = 3, c = 4 }
assert.same<c.TypeOf<typeof SpecifiedNumericEnum.decoder>, SpecifiedNumericEnum>(true)

@decodable!!()
enum InitializedNumericEnum { a = 2, b, c }
assert.same<c.TypeOf<typeof InitializedNumericEnum.decoder>, InitializedNumericEnum>(true)

@decodable!!()
enum Yoyoyoyo { a = 'a', b = 'b', c = 'c' }
assert.same<c.TypeOf<typeof Yoyoyoyo.decoder>, Yoyoyoyo>(true)

@decodable!!()
export enum HeterogeneousEnum { a = 2, b = 'b', c = 5 }
assert.same<c.TypeOf<typeof HeterogeneousEnum.decoder>, HeterogeneousEnum>(true)

export type Dict<T> = { [key: string]: T }
export type Cast<T, U> = T extends U ? T : never

export type UnionToIntersection<U> =
	(U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

export type BoxedTupleUnion<L extends any[]> = { [K in keyof L]: [L[K]] }[number]
export type UnboxIntersection<T> = T extends { 0: infer U } ? U : never
// export type TupleIntersection<L extends any[]> = UnionToIntersection<L[number]>
export type TupleIntersection<L extends any[]> = UnboxIntersection<UnionToIntersection<BoxedTupleUnion<L>>>
// export type FilteredTupleIntersection<L extends any[], E> = UnionToIntersection<Exclude<L[number], E>>
export type FilteredTupleIntersection<L extends any[], E> = UnboxIntersection<UnionToIntersection<Exclude<BoxedTupleUnion<{
	[K in keyof L]: L[K]
}>, [E]>>>

export type ExtractFromTupleToUnion<L extends any[], F> = Extract<L[number], F>
export type ExcludeFromTupleToUnion<L extends any[], F> = Exclude<L[number], F>

export type IsTrue<B extends boolean> = B extends true ? true : false
export type IsFalse<B extends boolean> = B extends false ? true : false

export type Equivalent<T, U> = T extends U ? U extends T ? true : false : false
export type Negate<B extends boolean> = B extends true ? false : true
export type TupleLike<T> = T extends any[] ? Negate<Equivalent<T, any[]>> : false

export type AllTrue<C extends boolean[]> = C extends true[] ? true : false
export type AllFalse<C extends boolean[]> = C extends false[] ? true : false
export type NoneTrue<C extends boolean[]> = AllFalse<C>
export type NoneFalse<C extends boolean[]> = AllTrue<C>
export type SomeTrue<C extends boolean[]> = Negate<AllFalse<C>>
export type SomeFalse<C extends boolean[]> = Negate<AllTrue<C>>

export type AllTupleLike<L extends any[]> = AllTrue<{ [K in keyof L]: TupleLike<L[K]> }>

type AbstractConstructorHelper<T> = (new (...args: any) => { [x: string]: any; }) & T
export type AbstractContructorParameters<T> = ConstructorParameters<AbstractConstructorHelper<T>>

export function isObject(input: unknown): input is NonNullable<Object> {
	return typeof input === 'object' && input !== null
}

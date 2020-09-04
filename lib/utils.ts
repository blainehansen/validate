export type Dict<T> = { [key: string]: T }

export type UnionToIntersection<U> =
	(U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

export type TupleIntersection<L extends any[]> = UnionToIntersection<L[number]>

export type Equivalent<T, U> = T extends U ? U extends T ? true : false : false
export type Negate<B extends boolean> = B extends true ? false : true
export type TupleLike<T> = T extends any[] ? Negate<Equivalent<T, any[]>> : false

export type AllTrue<C extends boolean[]> = C extends true[] ? true : false
export type NoneTrue<C extends boolean[]> = C extends false[] ? true : false
export type AllFalse<C extends boolean[]> = NoneTrue<C>
export type NoneFalse<C extends boolean[]> = AllTrue<C>
export type SomeTrue<C extends boolean[]> = Negate<NoneTrue<C>>
export type SomeFalse<C extends boolean[]> = Negate<AllTrue<C>>

export type AllTupleLike<L extends any[]> = AllTrue<{ [K in keyof L]: TupleLike<L[K]> }>

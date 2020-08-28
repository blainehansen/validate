export type UnionToIntersection<U> =
	(U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

export type TupleIntersection<L extends any[]> = UnionToIntersection<L[number]>

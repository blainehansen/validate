export type Same<A, B> =
	[A] extends [B] ? [B] extends [A]
		? true
		: false : false

export type IsNever<T> = Same<T, never>

export namespace assertType {
	export function boolean<B extends boolean>(
		expectTrue: B extends true ? true : false
	) {}
	export function valueBoolean<B extends boolean>(
		b: B,
		expectTrue: B extends true ? true : false
	) {}

	export function same<A, B>(
		expectTrue: Same<A, B> extends true ? true : false
	) {}
	export function valuesSame<A, B>(
		a: A, b: B,
		expectTrue: Same<A, B> extends true ? true : false
	) {}

	export function never<A>(
		expectTrue: IsNever<A> extends true ? true : false
	) {}
	export function valueNever<A>(
		a: A,
		expectTrue: IsNever<A> extends true ? true : false
	) {}

	export function value<A>(
		a: A
	) {}


	export function assignable<A, B>(
		expectTrue: B extends A ? true : false
	) {}

	export function valuesAssignable<A, B>(
		a: A, b: B,
		expectTrue: B extends A ? true : false
	) {}

	type AnyFunc = (...args: any[]) => any
	export function callable<F extends AnyFunc, A>(
		expectTrue: A extends Parameters<F> ? true : false
	) {}
	export function valuesCallable<F extends AnyFunc, A>(
		f: F, a: A,
		expectTrue: A extends Parameters<F> ? true : false
	) {}

	export function returnable<R, F extends AnyFunc>(
		expectTrue: ReturnType<F> extends R ? true : false
	) {}
	export function valuesReturnable<R, F extends AnyFunc>(
		r: R, f: F,
		expectTrue: ReturnType<F> extends R ? true : false
	) {}
}

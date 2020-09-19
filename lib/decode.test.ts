import 'mocha'
import { expect } from 'chai'

import * as c from './decode'
import { assertType as assert } from './utils.test'
import { Result, Ok, Err, Maybe, Some, None } from '@blainehansen/monads'

function t<T extends any[]>(...values: T): T { return values }

function validateExact<T>(decoder: c.ExactDecoder<T>, okValues: T[], errValues: any[]) {
	for (const value of okValues)
		expect(decoder.decodeExact(value)).eql(Ok(value))

	for (const value of errValues)
		expect(decoder.decodeExact(value).isErr()).true
}

function validate<T>(decoder: c.Decoder<T>, okValues: T[], errValues: any[]) {
	for (const value of okValues)
		expect(decoder.decode(value)).eql(Ok(value))

	for (const value of errValues)
		expect(decoder.decode(value).isErr()).true
}

function extra<T extends any[], O>(arr: T, obj: O): T & O {
	for (const key in obj)
		(arr as unknown as O)[key] = obj[key]
	return arr as T & O
}


describe('cls', () => it('works', () => {
	class A { constructor(readonly x: number, readonly y: string) {} }

	const pairs = [
		t(t(1, 'a'), new A(1, 'a')),
		t(t(0, ''), new A(0, '')),
		t(new A(1, 'a'), new A(1, 'a')),
		t(new A(0, ''), new A(0, '')),
	]
	const decoder = c.cls(A, c.tuple(c.number, c.string))

	for (const [okValue, expected] of pairs)
		expect(decoder.decode(okValue)).eql(Ok(expected))

	const errValues = [[], [1], ['a'], { x: 1, y: 'a' }, {}, { a: 'a' }, true, 3]
	for (const errValue of errValues)
		expect(decoder.decode(errValue).isErr()).true
}))

describe('adapt', () => it('works', () => {
	const a = c.adapt(
		c.boolean,
		c.adaptor(c.number, n => !!n),
		c.tryAdaptor(c.string, s => {
			if (s === 'true') return Ok(true)
			if (s === 'false') return Ok(false)
			return Err("")
		}),
	)

	assert.same<c.TypeOf<typeof a>, boolean>(true)

	const pairs = [
		t(true, true),
		t(false, false),
		t(1, true),
		t(0, false),
		t('true', true),
		t('false', false),
	]

	for (const [okValue, expected] of pairs)
		expect(a.decode(okValue)).eql(Ok(expected))

	const errValues = [[], 'a', 'tru', ['a'], {}, { a: 'a' }, Some(true), Some([]), Some('a'), None, Some('')]
	for (const errValue of errValues)
		expect(a.decode(errValue).isErr()).true
}))

describe('wrap', () => it('works', () => {
	const d = c.wrap("'b' | 7", (c): Result<'b' | 7> => {
		return c === 'b' || c === 7
			? Ok(c)
			: Err('blah')
	})

	assert.same<c.TypeOf<typeof d>, 'b' | 7>(true)

	validate<'b' | 7>(
		d,
		['b', 7],
		[null, undefined, [], ['a'], {}, { a: 'a' }, true, false, 'a', Infinity, NaN, -Infinity, -NaN],
	)
}))

describe('string', () => it('works', () => {
	const d = c.string
	assert.same<c.TypeOf<typeof d>, string>(true)

	validate<string>(
		d,
		['', 'a', "long thing", `stuff: ${5}`],
		[null, undefined, [], ['a'], {}, { a: 'a' }, 5, true, false],
	)
}))

describe('boolean', () => it('works', () => {
	const d = c.boolean
	assert.same<c.TypeOf<typeof d>, boolean>(true)

	validate<boolean>(
		d,
		[true, false],
		[null, undefined, [], ['a'], {}, { a: 'a' }, 5, 'a'],
	)
}))


describe('number', () => it('works', () => {
	const d = c.number
	assert.same<c.TypeOf<typeof d>, number>(true)

	validate<number>(
		d,
		[5, -5, 5.5, -5.5],
		[null, undefined, [], ['a'], {}, { a: 'a' }, true, false, 'a', Infinity, NaN, -Infinity, -NaN],
	)
}))
describe('looseNumber', () => it('works', () => {
	validate<number>(
		c.looseNumber,
		[5, -5, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
		[null, undefined, [], ['a'], {}, { a: 'a' }, true, false, 'a'],
	)
}))
describe('int', () => it('works', () => {
	validate<number>(
		c.int,
		[-2, -1, 0, 1, 2],
		[null, undefined, [], ['a'], {}, { a: 'a' }, true, false, 'a', 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)
}))
describe('uint', () => it('works', () => {
	validate<number>(
		c.uint,
		[0, 1, 2],
		[null, undefined, [], ['a'], {}, { a: 'a' }, true, false, 'a', -2, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)
}))


describe('recursive', () => it('works', () => {
	type Category = {
	  name: string,
	  categories: Category[],
	}

	const Category: c.Decoder<Category> = c.object('Category', { name: c.string, categories: c.array(c.recursive(() => Category)) })
	assert.same<c.TypeOf<typeof Category>, Category>(true)

	validate<Category>(
		Category,
		[{ name: 'a', categories: [] }, { name: 'b', categories: [{ name: 'b', categories: [] }] }],
		[null, undefined, [], 'a', true, 1, { name: 1, categories: [] }],
	)
}))


describe('union', () => it('works', () => {
	const d = c.union(c.string, c.boolean, c.number)
	assert.same<c.TypeOf<typeof d>, string | boolean | number>(true)
	const tt = c.tuple(d)

	validate<string | boolean | number>(
		d,
		['a', '', false, true, -1, 0, 1],
		[null, undefined, [], ['a'], {}, { a: 'a' }],
	)

	validate<string | null | undefined>(
		c.union(c.string, c.nullLiteral, c.undefinedLiteral),
		['a', '', null, undefined],
		[[], ['a'], {}, { a: 'a' }, true, false, 0, 1, 2, -2, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)

	// const separated = c.union(c.string, c.nullLiteral).decode
	// expect(separated('a')).eql(Ok('a'))
}))


describe('intersection', () => {
	it('works', () => {
		const d = c.intersection(
			c.object({ a: c.number }),
			c.object({ b: c.string }),
		)
		assert.same<c.TypeOf<typeof d>, { a: number, b: string }>(true)
		validate<{ a: number, b: string }>(
			d,
			[{ a: 1, b: 'a' }],
			[{ a: 1, b: 4 }, { a: 'a', b: 'a' }, { b: 'a' }, { a: 1 }, null, undefined, [], ['a'], {}, true, false, 'a', -2],
		)

		const n = c.intersection(
			d,
			c.object({ c: c.boolean }),
			c.object({ d: c.union(c.number, c.string) }),
		)
		assert.same<c.TypeOf<typeof n>, { a: number, b: string, c: boolean, d: number | string }>(true)
		validate<{ a: number, b: string, c: boolean, d: number | string }>(
			n,
			[{ a: 1, b: 'a', c: true, d: 1 }, { a: 1, b: 'a', c: true, d: 'a' }],
			[{ a: 1, b: 'a', c: false, d: true }, { a: 'a', b: 'a' }, { b: 'a' }, { a: 1 }, null, undefined, [], ['a'], {}, true, false, 'a', -2],
		)

		const arr1 = c.intersection(
			c.array(c.string),
			c.object({ a: c.number }),
		)
		assert.same<c.TypeOf<typeof arr1>, string[] & { a: number }>(true)
		validate(
			arr1,
			[extra(['a', 'b'], { a: 1 }), extra([], { a: 0 })],
			[['a'], extra(['a'], { a: 'a' }), extra(['a'], { b: 1 }), { a: 1 }, null, undefined, [], ['a'], {}, true, false, 'a', -2],
		)

		const arr2 = c.intersection(
			c.array(c.object({ a: c.string })),
			c.intersection(c.array(c.object({ b: c.number })), c.object({ r: c.boolean })),
			c.object({ n: c.number }),
			c.object({ f: c.undefinable(c.boolean) }),
		)
		assert.same<c.TypeOf<typeof arr2>, { a: string }[] & { b: number }[] & { r: boolean, n: number, f: boolean | undefined }>(true)
		validate(
			arr2,
			[extra([{ a: 'a', b: 1 }], { r: true, n: 1, f: undefined }), extra([], { r: true, n: 1, f: false })],
			[[], [{ a: 'a', b: 1 }], { r: true, n: 1, f: false }, { a: 1 }, null, undefined, [], ['a'], {}, true, false, 'a', -2],
		)

		const tup = c.intersection(
			c.tuple(c.object({ a: c.string })),
			c.tuple(c.object({ b: c.number })),
		)
		assert.same<c.TypeOf<typeof tup>, [{ a: string }] & [{ b: number }]>(true)
		validate(
			tup,
			[t({ a: 'a', b: 1 })],
			[[], [{ a: 'a', b: 1 }, { a: 'a', b: 1 }], { a: 1 }, null, undefined, ['a'], {}, true, false, 'a', -2],
		)

		const tupleAndArr = c.intersection(
			c.array(c.object({ a: c.string })),
			c.tuple(c.string),
		)
		assert.same<c.TypeOf<typeof tupleAndArr>, { a: string }[] & [string]>(true)

		const tupleAndObject = c.intersection(
			c.object({ a: c.string }),
			c.tuple(c.string),
		)
		assert.same<c.TypeOf<typeof tupleAndObject>, { a: string } & [string]>(true)
		validate(
			tupleAndObject,
			[extra(['a'], { a: 'a' }), extra([''], { a: '' })],
			[{ a: 'a' }, ['a'], extra(['a'], { a: 1 }), extra([1], { a: 'a' }), extra(['a'], { b: 'a' }), null, undefined, [], {}, false, 'a', -2],
		)

		const un1 = c.intersection(
			c.union(
				c.object({ a: c.string }),
				c.object({ b: c.boolean }),
			),
			c.object({ c: c.number })
		)
		assert.same<c.TypeOf<typeof un1>, ({ a: string } | { b: boolean }) & { c: number }>(true)
		validate(
			un1,
			[{ a: 'a', c: 1 }, { b: true, c: 1 }],
			[{ a: 'a' }, { b: true }, { a: 2, c: 4 }, { b: 'a', c: 4 }, { a: 1 }, null, undefined, [], ['a'], {}, true, false, 'a', -2],
		)

		const un2 = c.intersection(
			c.union(
				c.object({ a: c.string }),
				c.object({ b: c.boolean }),
			),
			c.union(
				c.object({ c: c.string }),
				c.object({ d: c.boolean }),
			),
			c.object('e', { e: c.number })
		)
		assert.same<c.TypeOf<typeof un2>, ({ a: string } | { b: boolean }) & ({ c: string } | { d: boolean }) & { e: number }>(true)
		validate(
			un2,
			[{ a: 'a', c: 'a', e: 1 }, { a: 'a', d: true, e: 1 }, { b: true, c: 'c', e: 1 }, { b: false, d: true, e: 1 }],
			[{ b: 'a', c: 4 }, null, undefined, [], ['a'], {}, true, false, 'a', -2],
		)

		validate<string[] & { yo: boolean }>(
			c.intersection(c.array(c.string), c.object({ yo: c.boolean })),
			[extra(['a', ''], { yo: false }), extra([], { yo: true })],
			[['a', ''], extra(['a', ''], { yo: 1 }), extra(['a', ''], { yom: true }), null, [1], { a: 'a' }, true, false, 'a', -2, -1, 5.5, -NaN],
		)

		validate<(string | number | null)[] & { what: string[] }>(
			c.intersection(c.array(c.union(c.string, c.number, c.nullLiteral)), c.object({ what: c.array(c.string) })),
			[extra([null, 'a', '', 5, -1, null], { what: [] }), extra([], { what: ['a', ''] })],
			[[null, 'a', '', 5, -1, null], extra([null, 'a', '', 5, -1, null], { what: [true] }), null, [true], {}, false, 'a', -2, 5.5, -NaN],
		)
	})
})

describe('nullLiteral', () => it('works', () => {
	validate<null>(
		c.nullLiteral,
		[null],
		[undefined, [], ['a'], {}, { a: 'a' }, true, false, 'a', 0, 1, 2, -2, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)
}))

describe('undefinedLiteral', () => it('works', () => {
	validate<undefined>(
		c.undefinedLiteral,
		[undefined],
		[null, [], ['a'], {}, { a: 'a' }, true, false, 'a', 0, 1, 2, -2, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)
}))


describe('literal', () => it('works', () => {
	validate<'a'>(
		c.literal('a'),
		['a'],
		[null, undefined, [], ['a'], {}, { a: 'a' }, true, 3, 'b'],
	)

	const a: Result<5> = c.literal(5).decode(null)

	// const separated = c.literal(4).decode
	// expect(separated(4)).eql(Ok(4))
}))

describe('literals', () => it('works', () => {
	validate<'a' | 5>(
		c.literals('a', 5),
		[5, 'a'],
		[null, undefined, [], ['a'], {}, { a: 'a' }, true, 3, 'b'],
	)

	const a: Result<'a' | 5> = c.literals('a', 5).decode(null)

	// const separated = c.literals(4, 5).decode
	// expect(separated(4)).eql(Ok(4))
	// expect(separated(5)).eql(Ok(5))
}))

describe('optional', () => it('works', () => {
	validate<string | undefined>(
		c.optional(c.string),
		['a', '', undefined],
		[null, [], ['a'], {}, { a: 'a' }, true, 3],
	)
}))

describe('undefinable', () => it('works', () => {
	validate<string | undefined>(
		c.undefinable(c.string),
		['a', '', undefined],
		[null, [], ['a'], {}, { a: 'a' }, true, 3],
	)
}))

describe('nullable', () => it('works', () => {
	validate<string | null>(
		c.nullable(c.string),
		['a', '', null],
		[undefined, [], ['a'], {}, { a: 'a' }, true, 3],
	)
}))

describe('nillable', () => it('works', () => {
	validate<string | null | undefined>(
		c.nillable(c.string),
		['a', '', undefined, null],
		[[], ['a'], {}, { a: 'a' }, true, 3],
	)
}))

describe('maybe', () => it('works', () => {
	const v = c.maybe(c.string)

	const pairs = [
		t('a', Some('a')),
		t('', Some('')),
		t(undefined, None),
		t(null, None),
	]

	for (const [okValue, expected] of pairs)
		expect(v.decode(okValue)).eql(Ok(expected))

	const errValues = [[], ['a'], {}, { a: 'a' }, true, 3, Some(true), Some([]), Some('a'), None, Some('')]
	for (const errValue of errValues)
		expect(v.decode(errValue).isErr()).true
}))


describe('array', () => it('works', () => {
	validate<string[]>(
		c.array(c.string),
		[['a', ''], []],
		[null, undefined, [1], {}, { a: 'a' }, true, false, 'a', -2, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)

	validate<(string | number | null)[]>(
		c.array(c.union(c.string, c.number, c.nullLiteral)),
		[[null, 'a', '', 5, -1, null], []],
		[null, undefined, [true], {}, { a: 'a' }, true, false, 'a', -2, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)

	// const separated = c.array(c.number).decode
	// expect(separated([4])).eql(Ok([4]))
}))


describe('dictionary', () => it('works', () => {
	validate<{ [key: string]: number }>(
		c.dictionary(c.number),
		[{ a: 1, b: 5 }, {}],
		[null, undefined, [], ['a'], { a: 'a' }, true, false, 'a', 0, 1, 2, -2, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)

	validate<{ [key: string]: number | null }>(
		c.dictionary(c.union(c.number, c.nullLiteral)),
		[{ a: 1, b: null, c: 5 }, {}],
		[null, undefined, [], ['a'], { a: 'a' }, true, false, 'a', 0, 1, 2, -2, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)

	// const separated = c.dictionary(c.number).decode
	// expect(separated({ a: 4 })).eql(Ok({ a: 4 }))
}))

describe('tuple', () => it('works', () => {
	validate<[number, boolean, string]>(
		c.tuple(c.number, c.boolean, c.string),
		[[1, true, 'a'], [0, false, '']],
		[null, undefined, [false, 'a', 0], [], ['a'], { a: 'a' }, true, false, 'a', 0, 1, 2, -2, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)

	validate<[]>(
		c.tuple(),
		[[]],
		[null, undefined, [false, 'a', 0], [undefined], { a: 'a' }, true, 'a', 0, 1, 2, -2, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)

	validate<[number?]>(
		c.tuple(c.optional(c.number)),
		[[], [1], [undefined]],
		[null, undefined, [false, 'a', 0], { a: 'a' }, true, 'a', 0, 1, 2, -2, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)

	validate<[number | string, boolean]>(
		c.tuple(c.union(c.number, c.string), c.boolean),
		[[1, true], ['a', false]],
		[null, undefined, [], [false, 'a', 0], ['a'], { a: 'a' }, true, 'a', 0, 1, -1, 5.5, -5.5, Infinity, NaN, -Infinity, -NaN],
	)

	validate<[number, ...string[]]>(
		c.spread(t(c.number), c.array(c.string)),
		[[1], [1, 'a'], [1, 'a', 'b'], [1, 'a', 'b', 'c']],
		[null, undefined, [], [1, 4], [false, 'a', 0], ['a'], { a: 'a' }, true, 'a', 0, 1, -1, -5.5, Infinity, -NaN],
	)

	validate<[number, boolean?, ...string[]]>(
		c.spread(t(c.number, c.optional(c.boolean)), c.array(c.string)),
		[[1], [1, undefined], [1, true], [1, true, 'a'], [1, undefined, 'a'], [1, false, 'b']],
		[null, undefined, [], [1, 4], [false, 'a', 0], ['a'], [1, 'a'], [1, 'a', 'b'], { a: 'a' }, true, 'a', 0, 1, -1, -5.5, Infinity, -NaN],
	)

	// const separated = c.tuple(c.number, c.boolean).decode
	// expect(separated([1, true])).eql(Ok([1, true]))
}))

describe('object strict', () => it('works', () => {
	validateExact<{ a: string, b: boolean, c: number | null }>(
		c.object('thing', {
			a: c.string,
			b: c.boolean,
			c: c.union(c.number, c.nullLiteral),
		}),
		[{ a: 'a', b: true, c: 5 }, { a: 'a', b: true, c: null }],
		[{}, null, undefined, [], ['a'], { a: 'a', b: 0, c: 4 }, { a: 'a', b: true, c: 4, d: 'a' }, true, 'a', 2, 5.5, -5.5, Infinity, NaN],
	)

	const anon = c.object({
		a: c.string,
		b: c.boolean,
		c: c.union(c.number, c.nullLiteral),
	})
	expect(anon.name).equal('{ a: string, b: boolean, c: number | null }')
	validateExact<{ a: string, b: boolean, c: number | null }>(
		anon,
		[{ a: 'a', b: true, c: 5 }, { a: 'a', b: true, c: null }],
		[{}, null, undefined, [], ['a'], { a: 'a', b: 0, c: 4 }, { a: 'a', b: true, c: 4, d: 'a' }, true, 'a', 2, 5.5, -5.5, Infinity, NaN],
	)

	validateExact<{ a?: string, b: boolean }>(
		c.object('thing', {
			a: c.optional(c.string),
			b: c.boolean,
		}),
		[{ a: 'a', b: true }, { b: false }, { a: undefined, b: false }],
		[{}, null, undefined, [], ['a'], { a: 'a' }, { b: true, c: 4 }, true, 'a', 2, 5.5, -5.5, Infinity, NaN],
	)

	// const separated = c.object('separated', { a: c.number }).decode
	// expect(separated({ a: 1 })).eql(Ok({ a: 1 }))
}))

describe('object', () => it('works', () => {
	validate(
		c.object('thing', {
			a: c.string,
			b: c.boolean,
			c: c.union(c.number, c.nullLiteral),
		}),
		[
			{ a: 'a', b: true, c: 5 },
			{ a: 'a', b: true, c: null },
			{ a: 'a', b: true, c: 4, d: 'a' } as unknown as { a: string, b: boolean, c: number | null },
		],
		[{}, null, undefined, [], ['a'], { a: 'a', b: 0, c: 4 }, { a: 'a', b: true, d: 'a' }, true, 'a', 2, -2, 5.5, -5.5, Infinity, NaN],
	)

	validate(
		c.object({
			a: c.string,
			b: c.boolean,
			c: c.union(c.number, c.nullLiteral),
		}),
		[
			{ a: 'a', b: true, c: 5 },
			{ a: 'a', b: true, c: null },
			{ a: 'a', b: true, c: 4, d: 'a' } as unknown as { a: string, b: boolean, c: number | null },
		],
		[{}, null, undefined, [], ['a'], { a: 'a', b: 0, c: 4 }, { a: 'a', b: true, d: 'a' }, true, 'a', 2, -2, 5.5, -5.5, Infinity, NaN],
	)

	validate(
		c.object('thing', {
			a: c.optional(c.string),
			b: c.boolean,
		}),
		[
			{ a: 'a', b: true },
			{ b: false, c: 4 } as unknown as { a?: string, b: boolean },
			{ a: undefined, b: false, d: null } as unknown as { a?: string, b: boolean },
		],
		[{}, null, undefined, [], ['a'], { a: 'a' }, { a: 1, b: true }, true, 'a', 2, 5.5, -5.5, Infinity, NaN],
	)

	// const separated = c.object('separated', { a: c.number }).decode
	// expect(separated({ a: 1 })).eql(Ok({ a: 1 }))
}))

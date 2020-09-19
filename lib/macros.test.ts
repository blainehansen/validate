import * as c from './decode'
import { assertType as assert } from './utils.test'

@decodable!!()
type S = string
assert.same<c.TypeOf<typeof S.decoder>, string>(true)

@decodable!!()
type A = string[]
assert.same<c.TypeOf<typeof A.decoder>, string[]>(true)

@decodable!!()
type B = { b: number }
assert.same<c.TypeOf<typeof B.decoder>, { b: number }>(true)

@decodable!!()
type G<L, R> = { left: L, right: R }

@decodable!!()
type GAB = G<string, number>
// const g = G.decoder<A, B>(A.decoder, B.decoder)
// const g: c.TypeOf<typeof GAB.decoder> = { left: ['a'], right: { b: 1 } }
// assert.same<c.TypeOf<typeof GAB.decoder>, { left: A, right: B }>(true)

const result = GAB.decoder.decode({})
if (result.isOk()) {
	const gab: GAB = result.value
	gab.left.toLowerCase()
	gab.right.toFixed()
}

// @decodable!!()
// type GAboolean = G<A, boolean>
// assert.same<c.TypeOf<typeof GAboolean.decoder>, { a: string, b: boolean }>(true)

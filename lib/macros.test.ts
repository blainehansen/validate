import 'mocha'
import { expect } from 'chai'

import * as c from './decode'
import { assertType as assert } from './utils.test'

@decodable!!()
type A = { a: string, b: number }
// namespace A {
// 	export const decoder = c.object('A', { a: c.string, b: c.number })
// }

@decodable!!()
type G<A, B> = { a: A, b: B }
// namespace G {
// 	export function decoder<A, B>(A: c.Decoder<A>, B: c.Decoder<B>) {
// 		return c.object('A', { a: A, b: B })
// 	}
// }

@decodable!!()
type GC = G<A, boolean>
// namespace GC {
// 	export const decoder = G.decoder(A.decoder, c.boolean)
// }

// describe('macros', )

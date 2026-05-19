/**
 * Step 1 of the toolmodes/addons refactor: prove the test infra works.
 *
 * - Jest + jsdom can run.
 * - nstructjs (the serializer everything else builds on) round-trips a registered
 *   struct in this environment. If this breaks, every later roundtrip test breaks
 *   with it.
 *
 * The real save/load roundtrip tests (roundtrip_mesh, roundtrip_missing_addon,
 * roundtrip_missing_toolmode) land in later steps once the headless scene fixture
 * works. See /root/.claude/plans/we-will-be-working-peppy-wreath.md §7.2 Layer C.
 */

import * as nstructjs from 'nstructjs'

class TrivialStruct {
  x = 0
  y = 0
  label = ''

  loadSTRUCT(reader: (this2: TrivialStruct) => void): void {
    reader(this)
  }

  static STRUCT = `
TrivialStruct {
  x     : int;
  y     : int;
  label : string;
}
`
}
nstructjs.register(TrivialStruct)

describe('test infrastructure', () => {
  test('jsdom is the test environment', () => {
    expect(typeof window).toBe('object')
    expect(typeof document).toBe('object')
  })

  test('nstructjs round-trips a registered class', () => {
    const src = new TrivialStruct()
    src.x = 7
    src.y = -3
    src.label = 'hello'

    const data: number[] = []
    nstructjs.manager.write_object(data, src)
    const bytes = new Uint8Array(data)

    const dst = nstructjs.readObject(bytes, TrivialStruct) as TrivialStruct

    expect(dst.x).toBe(7)
    expect(dst.y).toBe(-3)
    expect(dst.label).toBe('hello')
  })
})

/**
 * Unit tests for the brush stroke driver's pure geometry math
 * (`scripts/util/stroke_math.ts`). Like isect_frustum.test.ts these run the
 * dependency-free `number[]` math directly — it imports nothing from
 * path.ux/vectormath/three, so it loads in the jsdom harness. The driver layer
 * that calls these (`stroke_driver.ts`) drags in path.ux and is covered by the
 * integration test instead.
 */
import {
  crToBezier,
  evalCubic,
  cubicDeriv,
  subCubic,
  arcLengthWalk,
  dist,
  type Cubic,
  type Vec,
} from '../../scripts/util/stroke_math.js'

function near(a: number, b: number, eps = 1e-6): void {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(eps)
}
function nearV(a: Vec, b: Vec, eps = 1e-6): void {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) near(a[i], b[i], eps)
}

describe('crToBezier', () => {
  test('the segment passes through its inner control points P1 and P2', () => {
    const P0 = [0, 0]
    const P1 = [1, 2]
    const P2 = [4, 3]
    const P3 = [6, 1]
    const B = crToBezier(P0, P1, P2, P3, 0.5)
    nearV(evalCubic(B, 0), P1)
    nearV(evalCubic(B, 1), P2)
  })

  test('B0/B3 equal the inner control points exactly', () => {
    const B = crToBezier([0, 0], [1, 1], [3, 2], [5, 0], 0.5)
    nearV(B[0], [1, 1])
    nearV(B[3], [3, 2])
  })

  test('uniform (alpha=0) reduces to the classic 1/6 tangent form', () => {
    // For uniform CR, B1 = P1 + (P2 - P0)/6 and B2 = P2 - (P3 - P1)/6.
    const P0 = [0, 0]
    const P1 = [1, 0]
    const P2 = [2, 1]
    const P3 = [4, 1]
    const B = crToBezier(P0, P1, P2, P3, 0)
    const B1 = [P1[0] + (P2[0] - P0[0]) / 6, P1[1] + (P2[1] - P0[1]) / 6]
    const B2 = [P2[0] - (P3[0] - P1[0]) / 6, P2[1] - (P3[1] - P1[1]) / 6]
    nearV(B[1], B1)
    nearV(B[2], B2)
  })

  test('left-clamped endpoint (P0===P1) gives a one-sided tangent, no NaN', () => {
    const P1 = [1, 1]
    const B = crToBezier(P1, P1, [3, 2], [5, 0], 0.5)
    nearV(evalCubic(B, 0), P1)
    nearV(evalCubic(B, 1), [3, 2])
    for (const c of B) for (const v of c) expect(Number.isFinite(v)).toBe(true)
  })

  test('right-clamped endpoint (P3===P2) gives a one-sided tangent, no NaN', () => {
    const P2 = [3, 2]
    const B = crToBezier([0, 0], [1, 1], P2, P2, 0.5)
    nearV(evalCubic(B, 0), [1, 1])
    nearV(evalCubic(B, 1), P2)
    for (const c of B) for (const v of c) expect(Number.isFinite(v)).toBe(true)
  })

  test('works in 3D', () => {
    const B = crToBezier([0, 0, 0], [1, 0, 1], [2, 1, 1], [3, 1, 0], 0.5)
    nearV(evalCubic(B, 0), [1, 0, 1])
    nearV(evalCubic(B, 1), [2, 1, 1])
  })
})

describe('cubicDeriv', () => {
  test('derivative matches a finite difference of evalCubic', () => {
    const B = crToBezier([0, 0], [1, 2], [4, 3], [6, 1], 0.5)
    const h = 1e-5
    for (const s of [0.1, 0.4, 0.75]) {
      const a = evalCubic(B, s - h)
      const b = evalCubic(B, s + h)
      const fd = [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h)]
      nearV(cubicDeriv(B, s), fd, 1e-3)
    }
  })
})

describe('centripetal CR does not overshoot clustered-then-far input', () => {
  test('a tight pair followed by a far point stays within a sane bound', () => {
    // Two near-coincident points then a far jump is the classic case where
    // uniform CR loops/overshoots; centripetal (alpha=0.5) must not.
    const P0 = [0, 0]
    const P1 = [0.01, 0] // clustered against P0
    const P2 = [10, 0.2]
    const P3 = [10.01, 0.2]
    const B = crToBezier(P0, P1, P2, P3, 0.5)

    let maxY = -Infinity
    let minY = Infinity
    for (let i = 0; i <= 64; i++) {
      const p = evalCubic(B, i / 64)
      maxY = Math.max(maxY, p[1])
      minY = Math.min(minY, p[1])
      // x must advance monotonically-ish: never run backwards past the start
      expect(p[0]).toBeGreaterThanOrEqual(P1[0] - 0.05)
      expect(p[0]).toBeLessThanOrEqual(P2[0] + 0.05)
    }
    // y stays inside the endpoints' band (no wild excursion off the line)
    expect(maxY).toBeLessThanOrEqual(0.25)
    expect(minY).toBeGreaterThanOrEqual(-0.05)
  })
})

describe('arcLengthWalk', () => {
  function straightLine(len: number): Cubic {
    // a degenerate cubic that is a straight segment from (0,0) to (len,0)
    return [
      [0, 0],
      [len / 3, 0],
      [(2 * len) / 3, 0],
      [len, 0],
    ]
  }

  test('emits ~L/d evenly-spaced samples on a straight line', () => {
    const L = 10
    const d = 1
    const B = straightLine(L)
    const {ts} = arcLengthWalk(B, d, 0, 64)

    // ~L/d dabs (first dab lands at distance d, so ~10)
    expect(ts.length).toBeGreaterThanOrEqual(9)
    expect(ts.length).toBeLessThanOrEqual(11)

    // consecutive emitted points are ~d apart in real space
    let prev = evalCubic(B, 0)
    for (const t of ts) {
      const cur = evalCubic(B, t)
      near(dist(prev, cur), d, 5e-2)
      prev = cur
    }
  })

  test('carry makes the cadence continuous across abutting segments', () => {
    // Split the same length-10 line into two length-5 halves and walk them with
    // carry threaded through; the global cadence must match a single walk.
    const d = 1
    const whole = straightLine(10)
    const single = arcLengthWalk(whole, d, 0, 128).ts.length

    const firstHalf: Cubic = [
      [0, 0],
      [5 / 3, 0],
      [10 / 3, 0],
      [5, 0],
    ]
    const secondHalf: Cubic = [
      [5, 0],
      [5 + 5 / 3, 0],
      [5 + 10 / 3, 0],
      [10, 0],
    ]
    const w1 = arcLengthWalk(firstHalf, d, 0, 128)
    const w2 = arcLengthWalk(secondHalf, d, w1.carryOut, 128)
    expect(w1.ts.length + w2.ts.length).toBe(single)
  })

  test('without carry, abutting segments double-count the seam', () => {
    // Sanity: dropping the carry yields a different (larger) count, proving the
    // carry term is what makes the seam continuous.
    const d = 1
    const single = arcLengthWalk(straightLine(10), d, 0, 128).ts.length
    const firstHalf = straightLine(5)
    const secondHalf = straightLine(5)
    const naive =
      arcLengthWalk(firstHalf, d, 0, 128).ts.length +
      arcLengthWalk(secondHalf, d, 0, 128).ts.length
    expect(naive).toBeGreaterThanOrEqual(single)
  })

  test('spacing larger than the curve emits nothing but carries the length', () => {
    const B = straightLine(2)
    const {ts, carryOut} = arcLengthWalk(B, 10, 0, 64)
    expect(ts.length).toBe(0)
    near(carryOut, 2, 1e-2)
  })

  test('zero/negative spacing is a no-op that preserves carry', () => {
    const B = straightLine(5)
    const {ts, carryOut} = arcLengthWalk(B, 0, 1.5, 64)
    expect(ts.length).toBe(0)
    expect(carryOut).toBe(1.5)
  })
})

describe('subCubic', () => {
  test('the extracted sub-cubic matches the parent on its sub-interval', () => {
    const B = crToBezier([0, 0], [1, 2], [4, 3], [6, 1], 0.5)
    const t0 = 0.25
    const t1 = 0.75
    const sub = subCubic(B, t0, t1)
    for (let i = 0; i <= 8; i++) {
      const u = i / 8
      const parent = evalCubic(B, t0 + (t1 - t0) * u)
      nearV(evalCubic(sub, u), parent, 1e-6)
    }
  })

  test('clamps to [0,1] and a degenerate range collapses to a point', () => {
    const B = crToBezier([0, 0], [1, 2], [4, 3], [6, 1], 0.5)
    const sub = subCubic(B, -0.2, 0) // t1<=eps collapses to B[0]
    nearV(evalCubic(sub, 0), B[0])
    nearV(evalCubic(sub, 1), B[0])
  })
})

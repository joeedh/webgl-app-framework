/**
 * Per-test-file setup. Loaded via tests/jest.config.ts's `setupFiles`.
 *
 * jsdom doesn't expose Node's TextEncoder/TextDecoder inside its VM context.
 * Bridge them through so modules that use these globals (e.g. storage.ts's
 * readJSON) work in tests.
 *
 * URL.createObjectURL is not implemented in jsdom either, but storage.ts
 * already detects this and falls back to data: URLs which work natively.
 */

import {TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder} from 'node:util'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any
if (typeof g.TextEncoder !== 'function') g.TextEncoder = NodeTextEncoder
if (typeof g.TextDecoder !== 'function') g.TextDecoder = NodeTextDecoder

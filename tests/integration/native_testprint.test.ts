/**
 * Native-side stdout smoke test.
 *
 * The native N-API addon exposes `testPrint(msg)` (source/napi/napi_runtime.cc),
 * which writes straight to the C `stdout` stream from C++. In a headless NW.js
 * launch the renderer (where the addon loads) starts with fd 0/1/2 closed
 * (EBADF), so a bare `printf` is written to a dead fd and lost — the launched
 * process's captured stdout stays empty. The companion `redirectStdout(path)`
 * `freopen()`s stdout onto a launcher-supplied file first (the standard Windows
 * GUI-subsystem workaround), giving the C++ output a real destination this
 * wrapper reads back.
 *
 * So this boots the real NW.js app headlessly on the native backend and, via the
 * harness `--eval`, calls `redirectStdout(<tmp>)` then `testPrint(<marker>)`,
 * then asserts the marker shows up in the redirected file — i.e. that C++ stdout
 * printing genuinely runs and produces the bytes. The captured contents are also
 * forwarded to this process's stdout (the "pipe it through the wrapper" step).
 *
 * Self-skips (so CI without the native clang/cmake-js toolchain stays green) if
 * `nw` isn't resolvable, the app bundle is missing (`pnpm build`), or the native
 * addon is missing (`sculptcore/make.mjs node`).
 */
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import Path from 'node:path'
import {NWJS_APP_DIR, REPO_ROOT, resolveNwjsExe} from './nwjs_boot'

const BUNDLE = Path.join(REPO_ROOT, 'build', 'entry_point.js')
const NATIVE_ADDON = Path.join(REPO_ROOT, 'sculptcore', 'build', 'native-node', 'sculptcore_node.node')

const nwExe = resolveNwjsExe()
const haveBundle = fs.existsSync(BUNDLE)
const haveNative = fs.existsSync(NATIVE_ADDON)
const canRun = !!nwExe && haveBundle && haveNative

const maybe = canRun ? describe : describe.skip

if (!canRun) {
  const why = [
    !nwExe && 'nw not resolvable (nwjs/ workspace)',
    !haveBundle && `app bundle missing (${Path.relative(REPO_ROOT, BUNDLE)}; run pnpm build)`,
    !haveNative && `native addon missing (${Path.relative(REPO_ROOT, NATIVE_ADDON)}; run make.mjs node)`,
  ]
    .filter(Boolean)
    .join('; ')
  // eslint-disable-next-line no-console
  console.warn(`[native-testprint] skipped: ${why}`)
}

maybe('native testPrint stdout', () => {
  // Unique per run so a stale file can't false-pass.
  const marker = `__SCULPTCORE_TESTPRINT__${process.pid}_${Date.now()}`
  const tmp = Path.join(os.tmpdir(), `sc_testprint_${process.pid}_${Date.now()}.txt`)
  let captured = ''

  beforeAll(() => {
    fs.rmSync(tmp, {force: true})
    // redirectStdout the C stdout onto `tmp`, then print the marker (and the
    // default message) from C++. JSON.stringify yields valid JS string literals
    // for the Windows path + marker inside the single --eval token.
    const expr =
      `globalThis.__nativeManager.addon.redirectStdout(${JSON.stringify(tmp)});` +
      `globalThis.__nativeManager.addon.testPrint(${JSON.stringify(marker)});` +
      `globalThis.__nativeManager.addon.testPrint()`
    execFileSync(
      nwExe!,
      [NWJS_APP_DIR, '--apptest-headless', '--no-devtools', '--backend', 'native', '--eval', expr, '--exit'],
      {cwd: REPO_ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 60000}
    )
    captured = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf-8') : ''
    // Pipe the native stdout through this wrapper's own stdout.
    if (captured) process.stdout.write(`[native-testprint] captured C++ stdout:\n${captured}`)
  }, 120000)

  afterAll(() => fs.rmSync(tmp, {force: true}))

  test('C++ testPrint output is produced on stdout (via redirect)', () => {
    expect(captured).toContain(marker)
    // The default-message overload also reached stdout.
    expect(captured).toContain('native stdout OK')
  })
})

/**
 * Minimal smoke-test addon. Exercises the build-addons pipeline:
 *   - exports addonDefine + register + unregister (the IAddon shape)
 *   - calls api.exportNamespace from register so addon-to-addon plumbing
 *     gets a workout
 *   - records every call its lifecycle hooks receive on a module-level
 *     `seen` array the test reads
 *
 * No imports from `../../scripts/...` (yet) — that path becomes interesting
 * once the runtime resolver lands in step 5c. For now the smoke test
 * verifies that an esbuild-built addon bundle loads via dynamic import,
 * its register() runs, and exportNamespace makes its API visible.
 */

export interface ITestAddonAPI {
  greet(name: string): string
}

export const seen: string[] = []

export const addonDefine = {
  name       : 'Test Addon',
  version    : 1,
  author     : 'tests',
  url        : '',
  icon       : -1,
  description: 'fixture addon — smoke tests only',
} as const

export function register(api: {
  exportNamespace?(name: string, exports: Record<string, unknown>): void
  addonId?: string
}) {
  seen.push('register')

  const exports: ITestAddonAPI = {
    greet(name: string) {
      return `hello ${name}`
    },
  }
  api.exportNamespace?.('test_addon', exports as unknown as Record<string, unknown>)
}

export function unregister() {
  seen.push('unregister')
}

/**
 * Tiny line-based preprocessor for shader sources.
 *
 * WGSL has no preprocessor, but the existing GLSL shaders under
 * `scripts/shaders/shaders.ts` and `scripts/shadernodes/` use
 * `#define` / `#ifdef` / `#ifndef` / `#else` / `#endif` / `#include`
 * for feature flag variant generation (`SMOOTH_LINE`, `HAVE_COLOR`,
 * `VCOL_PATCH`, `DRAW_FLAT`, `WITH_BOXVERTS`, `BRUSH_TEX`, …) plus
 * noise/lighting helper inlining.
 *
 * This module runs *before* WGSL compilation so the existing generator
 * functions in `shaders.ts` can keep emitting `#ifdef` blocks — they
 * just emit WGSL bodies instead of GLSL bodies.
 *
 * Supported directives (line-based, must appear at column 0 after
 * optional leading whitespace):
 *
 *   #define NAME              → defined with empty value
 *   #define NAME VALUE...     → defined with string value (rest of line)
 *   #undef NAME
 *   #ifdef NAME               → keep block while NAME is defined
 *   #ifndef NAME              → keep block while NAME is *not* defined
 *   #if 0 / #if 1             → literal zero/non-zero gate (no expressions)
 *   #else
 *   #endif
 *   #include "path"           → resolved via the `includes` table
 *
 * Not supported (intentional — keep it ~150 LOC): macro expansion of
 * `#define`d names inside arbitrary lines, `#if defined(X) && …`
 * expressions, `#elif`. The existing GLSL generators don't use these.
 */

export interface PreprocessOptions {
  /** Map of `NAME` → value-or-true for `#define`d feature flags. */
  defines?: Record<string, string | boolean | number>
  /** Map of include-path → preprocessed body, for `#include "path"`. */
  includes?: Record<string, string>
  /** Hard cap on recursion depth for `#include`. */
  maxIncludeDepth?: number
}

type DefinesMap = Record<string, string | boolean | number>

const DIRECTIVE = /^\s*#\s*(define|undef|ifdef|ifndef|if|else|endif|include)\b\s*(.*)$/

export function preprocess(source: string, opts: PreprocessOptions = {}): string {
  const defines: DefinesMap = {...(opts.defines ?? {})}
  const includes = opts.includes ?? {}
  const maxDepth = opts.maxIncludeDepth ?? 8

  return run(source, defines, includes, maxDepth)
}

function run(
  source: string,
  defines: DefinesMap,
  includes: Record<string, string>,
  depth: number
): string {
  if (depth < 0) throw new Error('preprocess: #include depth limit exceeded')

  const lines = source.split('\n')
  const out: string[] = []

  // Stack of "are we currently emitting?" flags, one per nested
  // #if/#ifdef/#ifndef level. Top of stack is consulted on every line.
  const emitStack: boolean[] = [true]
  // Parallel stack of "has the active branch already taken effect?" — used
  // to suppress an #else after an active #if.
  const tookStack: boolean[] = [true]

  const emitting = () => emitStack.every(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = DIRECTIVE.exec(line)
    if (!match) {
      if (emitting()) out.push(line)
      continue
    }

    const directive = match[1]
    const arg = match[2].trim()

    switch (directive) {
      case 'define': {
        if (!emitting()) break
        const [name, ...rest] = arg.split(/\s+/)
        defines[name] = rest.length ? rest.join(' ') : true
        break
      }
      case 'undef': {
        if (!emitting()) break
        delete defines[arg]
        break
      }
      case 'ifdef':
      case 'ifndef': {
        const cond = directive === 'ifdef' ? arg in defines : !(arg in defines)
        emitStack.push(cond)
        tookStack.push(cond)
        break
      }
      case 'if': {
        // Only literal `#if 0` / `#if 1` supported.
        const cond = arg === '0' ? false : arg === '1' ? true : false
        if (arg !== '0' && arg !== '1') {
          throw new Error(`preprocess: unsupported #if expression: ${arg}`)
        }
        emitStack.push(cond)
        tookStack.push(cond)
        break
      }
      case 'else': {
        if (emitStack.length <= 1) {
          throw new Error('preprocess: #else without matching #if')
        }
        const took = tookStack[tookStack.length - 1]
        emitStack[emitStack.length - 1] = !took
        break
      }
      case 'endif': {
        if (emitStack.length <= 1) {
          throw new Error('preprocess: #endif without matching #if')
        }
        emitStack.pop()
        tookStack.pop()
        break
      }
      case 'include': {
        if (!emitting()) break
        const path = arg.replace(/^"(.*)"$/, '$1').replace(/^<(.*)>$/, '$1')
        const body = includes[path]
        if (body === undefined) {
          throw new Error(`preprocess: unresolved #include "${path}"`)
        }
        out.push(run(body, defines, includes, depth - 1))
        break
      }
    }
  }

  if (emitStack.length !== 1) {
    throw new Error('preprocess: unterminated #if / #ifdef')
  }

  return out.join('\n')
}

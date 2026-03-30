/** assumes enum maps to numbers */
export function* enumKeys(e: Record<string | number, string | number>) {
  for (const k in e) {
    if (typeof k === 'string') {
      yield k
    }
  }
}

/** assumes enum maps to numbers */
export function* enumValues(e: Record<string | number, string | number>) {
  for (const k in e) {
    if (typeof k === 'string') {
      yield e[k]
    }
  }
}

/** Used to make ts enums compatible with path.ux */
export function deleteTsEnumIntegers(obj: Record<string | number, string | number>): Record<string, string | number> {
  const r = {} as Record<string, string | number>
  for (const k in obj) {
    if (typeof k === 'string' && isNaN(parseInt(k))) {
      r[k] = obj[k]
    }
  }
  return r
}

declare global {
  interface Window {
    deleteTsEnumIntegers: typeof deleteTsEnumIntegers
  }
  function deleteTsEnumIntegers(obj: Record<string | number, string | number>): Record<string, string | number>
}
window.deleteTsEnumIntegers = deleteTsEnumIntegers

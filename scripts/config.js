let prefix = location.pathname
if (prefix.endsWith('/')) {
  prefix = prefix.slice(0, prefix.length - 1)
}

let suffix = '/index.html'

// check if we have a different html file suffix
if (prefix.toLowerCase().endsWith('.html')) {
  let i = prefix.length - 5
  while (i > 0 && prefix[i - 1] !== '/') {
    i--
  }
  suffix = prefix.slice(i)
}

if (prefix.endsWith(suffix)) {
  prefix = prefix.slice(0, prefix.length - suffix.length)
}
window.__prefix = prefix

export const HOST = location.host
export const SITEPREFIX = prefix

export function joinPrefix(path) {
  path = path.trim()

  while (path.startsWith('/')) {
    path = path.slice(1, path.length)
  }

  if (!SITEPREFIX.endsWith('/')) {
    path = '/' + path
  }

  return SITEPREFIX + path
}

export function resolvePath(path) {
  path = joinPrefix(path)
  if (!path.startsWith('/')) {
    path = '/' + path
  }

  return location.protocol + '//' + HOST + path
}

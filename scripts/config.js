let prefix = location.pathname
if (prefix.endsWith("/")) {
    prefix = prefix.slice(0, prefix.length-1);
}

window.__prefix = prefix;

export const HOST = location.host;
export const SITEPREFIX = prefix;

export function joinPrefix(path) {
    path = path.trim();

    if (path.length == 0 || path[0] !== "/") {
        path = "/" + path;
    }

    while (path.startsWith("/")) {
        path = path.slice(1, path.length);
    }

    return SITEPREFIX + path;
}

export function resolvePath(path) {
    return location.protocol + "//" + HOST + "/" + joinPrefix(path);
}
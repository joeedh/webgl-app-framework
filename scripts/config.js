let prefix = location.pathname
if (prefix.endsWith("/")) {
    prefix = prefix.slice(0, prefix.length-1);
}

let suffix = "/index.html";
if (prefix.endsWith(suffix)) {
    prefix = prefix.slice(0, prefix.length - suffix.length);
}
window.__prefix = prefix;


export const HOST = location.host;
export const SITEPREFIX = prefix;

export function joinPrefix(path) {
    path = path.trim();

    while (path.startsWith("/")) {
        path = path.slice(1, path.length);
    }

    if (!SITEPREFIX.endsWith("/")) {
        path = "/" + path;
    }

    return SITEPREFIX + path;
}

export function resolvePath(path) {
    path = joinPrefix(path);
    if (!path.startsWith("/")) {
        path = "/" + path;
    }
    
    return location.protocol + "//" + HOST + path;
}
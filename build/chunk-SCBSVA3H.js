var __defProp = Object.defineProperty;
var __knownSymbol = (name, symbol) => {
  return (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
};
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function")
      throw TypeError("Object expected");
    var dispose;
    if (async)
      dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0)
      dispose = value[__knownSymbol("dispose")];
    if (typeof dispose !== "function")
      throw TypeError("Object not disposable");
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0])
          return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError)
      throw error;
  };
  return next();
};

// scripts/path.ux/scripts/platforms/platform_base.ts
var mimeMap = {
  ".js": "application/javascript",
  ".json": "text/json",
  ".html": "text/html",
  ".txt": "text/plain",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".tiff": "image/tiff",
  ".gif": "image/gif",
  ".bmp": "image/bitmap",
  ".tga": "image/targa",
  ".svg": "image/svg+xml",
  ".xml": "text/xml",
  ".webp": "image/webp",
  "svg": "image/svg+xml",
  "txt": "text/plain",
  "html": "text/html",
  "css": "text/css",
  "ts": "application/typescript",
  "py": "application/python",
  "c": "application/c",
  "cpp": "application/cpp",
  "cc": "application/cpp",
  "h": "application/c",
  "hh": "application/cpp",
  "hpp": "application/cpp",
  "sh": "application/bash",
  "mjs": "application/javascript",
  "cjs": "application/javascript",
  "gif": "image/gif"
};
var textMimes = /* @__PURE__ */ new Set([
  "application/javascript",
  "application/x-javscript",
  "image/svg+xml",
  "application/xml"
]);
function isMimeText(mime) {
  if (!mime) {
    return false;
  }
  if (mime.startsWith("text")) {
    return true;
  }
  return textMimes.has(mime);
}
__name(isMimeText, "isMimeText");
function getExtension(path) {
  if (!path) {
    return "";
  }
  let i = path.length;
  while (i > 0 && path[i] !== ".") {
    i--;
  }
  return path.slice(i, path.length).trim().toLowerCase();
}
__name(getExtension, "getExtension");
function getMime(path) {
  let ext = getExtension(path);
  if (ext in mimeMap) {
    return mimeMap[ext];
  }
  return "application/x-octet-stream";
}
__name(getMime, "getMime");
var PlatformAPI = class {
  static {
    __name(this, "PlatformAPI");
  }
  static writeFile(data, handle, mime) {
    throw new Error("implement me");
  }
  static resolveURL(path, base = location.href) {
    base = base.trim();
    if (path.startsWith("./")) {
      path = path.slice(2, path.length).trim();
    }
    while (path.startsWith("/")) {
      path = path.slice(1, path.length).trim();
    }
    while (base.endsWith("/")) {
      base = base.slice(0, base.length - 1).trim();
    }
    let exts = ["html", "txt", "js", "php", "cgi"];
    for (let ext of exts) {
      ext = "." + ext;
      if (base.endsWith(ext)) {
        let i = base.length - 1;
        while (i > 0 && base[i] !== "/") {
          i--;
        }
        base = base.slice(0, i).trim();
      }
    }
    while (base.endsWith("/")) {
      base = base.slice(0, base.length - 1).trim();
    }
    const segments = (base + "/" + path).split("/");
    const path2 = [];
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === "..") {
        path2.pop();
      } else {
        path2.push(segments[i]);
      }
    }
    return path2.join("/");
  }
  static showOpenDialog(title, args = new FileDialogArgs()) {
    throw new Error("implement me");
  }
  static showSaveDialog(title, savedata_cb, args = new FileDialogArgs()) {
    throw new Error("implement me");
  }
  static readFile(path, mime) {
    throw new Error("implement me");
  }
};
var FileDialogArgs = class {
  static {
    __name(this, "FileDialogArgs");
  }
  multi = false;
  addToRecentList = false;
  defaultPath;
  filters = [];
};
var FilePath = class {
  static {
    __name(this, "FilePath");
  }
  data;
  filename;
  constructor(data, filename = "unnamed") {
    this.data = data;
    this.filename = filename;
  }
};

export {
  __name,
  __require,
  __export,
  __using,
  __callDispose,
  mimeMap,
  textMimes,
  isMimeText,
  getMime,
  PlatformAPI,
  FileDialogArgs,
  FilePath
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc2NyaXB0cy9wYXRoLnV4L3NjcmlwdHMvcGxhdGZvcm1zL3BsYXRmb3JtX2Jhc2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImV4cG9ydCBjb25zdCBtaW1lTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gIFwiLmpzXCIgIDogXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCIsXHJcbiAgXCIuanNvblwiOiBcInRleHQvanNvblwiLFxyXG4gIFwiLmh0bWxcIjogXCJ0ZXh0L2h0bWxcIixcclxuICBcIi50eHRcIiA6IFwidGV4dC9wbGFpblwiLFxyXG4gIFwiLmpwZ1wiIDogXCJpbWFnZS9qcGVnXCIsXHJcbiAgXCIucG5nXCIgOiBcImltYWdlL3BuZ1wiLFxyXG4gIFwiLnRpZmZcIjogXCJpbWFnZS90aWZmXCIsXHJcbiAgXCIuZ2lmXCIgOiBcImltYWdlL2dpZlwiLFxyXG4gIFwiLmJtcFwiIDogXCJpbWFnZS9iaXRtYXBcIixcclxuICBcIi50Z2FcIiA6IFwiaW1hZ2UvdGFyZ2FcIixcclxuICBcIi5zdmdcIiA6IFwiaW1hZ2Uvc3ZnK3htbFwiLFxyXG4gIFwiLnhtbFwiIDogXCJ0ZXh0L3htbFwiLFxyXG4gIFwiLndlYnBcIjogXCJpbWFnZS93ZWJwXCIsXHJcbiAgXCJzdmdcIiAgOiBcImltYWdlL3N2Zyt4bWxcIixcclxuICBcInR4dFwiICA6IFwidGV4dC9wbGFpblwiLFxyXG4gIFwiaHRtbFwiIDogXCJ0ZXh0L2h0bWxcIixcclxuICBcImNzc1wiICA6IFwidGV4dC9jc3NcIixcclxuICBcInRzXCIgICA6IFwiYXBwbGljYXRpb24vdHlwZXNjcmlwdFwiLFxyXG4gIFwicHlcIiAgIDogXCJhcHBsaWNhdGlvbi9weXRob25cIixcclxuICBcImNcIiAgICA6IFwiYXBwbGljYXRpb24vY1wiLFxyXG4gIFwiY3BwXCIgIDogXCJhcHBsaWNhdGlvbi9jcHBcIixcclxuICBcImNjXCIgICA6IFwiYXBwbGljYXRpb24vY3BwXCIsXHJcbiAgXCJoXCIgICAgOiBcImFwcGxpY2F0aW9uL2NcIixcclxuICBcImhoXCIgICA6IFwiYXBwbGljYXRpb24vY3BwXCIsXHJcbiAgXCJocHBcIiAgOiBcImFwcGxpY2F0aW9uL2NwcFwiLFxyXG4gIFwic2hcIiAgIDogXCJhcHBsaWNhdGlvbi9iYXNoXCIsXHJcbiAgXCJtanNcIiAgOiBcImFwcGxpY2F0aW9uL2phdmFzY3JpcHRcIixcclxuICBcImNqc1wiICA6IFwiYXBwbGljYXRpb24vamF2YXNjcmlwdFwiLFxyXG4gIFwiZ2lmXCIgIDogXCJpbWFnZS9naWZcIixcclxufTtcclxuXHJcbmV4cG9ydCB2YXIgdGV4dE1pbWVzID0gbmV3IFNldChbXHJcbiAgXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCIsXHJcbiAgXCJhcHBsaWNhdGlvbi94LWphdnNjcmlwdFwiLFxyXG4gIFwiaW1hZ2Uvc3ZnK3htbFwiLFxyXG4gIFwiYXBwbGljYXRpb24veG1sXCIsXHJcbl0pO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzTWltZVRleHQobWltZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XHJcbiAgaWYgKCFtaW1lKSB7XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG5cclxuICBpZiAobWltZS5zdGFydHNXaXRoKFwidGV4dFwiKSkge1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gdGV4dE1pbWVzLmhhcyhtaW1lKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEV4dGVuc2lvbihwYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcclxuICBpZiAoIXBhdGgpIHtcclxuICAgIHJldHVybiBcIlwiO1xyXG4gIH1cclxuXHJcbiAgbGV0IGkgPSBwYXRoLmxlbmd0aDtcclxuICB3aGlsZSAoaSA+IDAgJiYgcGF0aFtpXSAhPT0gXCIuXCIpIHtcclxuICAgIGktLTtcclxuICB9XHJcblxyXG4gIHJldHVybiBwYXRoLnNsaWNlKGksIHBhdGgubGVuZ3RoKS50cmltKCkudG9Mb3dlckNhc2UoKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldE1pbWUocGF0aDogc3RyaW5nKSB7XHJcbiAgbGV0IGV4dCA9IGdldEV4dGVuc2lvbihwYXRoKTtcclxuICBpZiAoZXh0IGluIG1pbWVNYXApIHtcclxuICAgIHJldHVybiBtaW1lTWFwW2V4dF07XHJcbiAgfVxyXG5cclxuICByZXR1cm4gXCJhcHBsaWNhdGlvbi94LW9jdGV0LXN0cmVhbVwiO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgUGxhdGZvcm1BUEkge1xyXG4gIHN0YXRpYyB3cml0ZUZpbGUoZGF0YTogQXJyYXlCdWZmZXIgfCBzdHJpbmcsIGhhbmRsZTogRmlsZVBhdGgsIG1pbWU6IHN0cmluZyk6IFByb21pc2U8dW5rbm93bj4ge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiaW1wbGVtZW50IG1lXCIpO1xyXG4gIH1cclxuXHJcbiAgc3RhdGljIHJlc29sdmVVUkwocGF0aDogc3RyaW5nLCBiYXNlID0gbG9jYXRpb24uaHJlZikge1xyXG4gICAgYmFzZSA9IGJhc2UudHJpbSgpO1xyXG5cclxuICAgIGlmIChwYXRoLnN0YXJ0c1dpdGgoXCIuL1wiKSkge1xyXG4gICAgICBwYXRoID0gcGF0aC5zbGljZSgyLCBwYXRoLmxlbmd0aCkudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHdoaWxlIChwYXRoLnN0YXJ0c1dpdGgoXCIvXCIpKSB7XHJcbiAgICAgIHBhdGggPSBwYXRoLnNsaWNlKDEsIHBhdGgubGVuZ3RoKS50cmltKCk7XHJcbiAgICB9XHJcblxyXG4gICAgd2hpbGUgKGJhc2UuZW5kc1dpdGgoXCIvXCIpKSB7XHJcbiAgICAgIGJhc2UgPSBiYXNlLnNsaWNlKDAsIGJhc2UubGVuZ3RoIC0gMSkudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBleHRzID0gW1wiaHRtbFwiLCBcInR4dFwiLCBcImpzXCIsIFwicGhwXCIsIFwiY2dpXCJdO1xyXG4gICAgZm9yIChsZXQgZXh0IG9mIGV4dHMpIHtcclxuICAgICAgZXh0ID0gXCIuXCIgKyBleHQ7XHJcbiAgICAgIGlmIChiYXNlLmVuZHNXaXRoKGV4dCkpIHtcclxuICAgICAgICBsZXQgaSA9IGJhc2UubGVuZ3RoIC0gMTtcclxuICAgICAgICB3aGlsZSAoaSA+IDAgJiYgYmFzZVtpXSAhPT0gXCIvXCIpIHtcclxuICAgICAgICAgIGktLTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGJhc2UgPSBiYXNlLnNsaWNlKDAsIGkpLnRyaW0oKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHdoaWxlIChiYXNlLmVuZHNXaXRoKFwiL1wiKSkge1xyXG4gICAgICBiYXNlID0gYmFzZS5zbGljZSgwLCBiYXNlLmxlbmd0aCAtIDEpLnRyaW0oKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzZWdtZW50cyA9IChiYXNlICsgXCIvXCIgKyBwYXRoKS5zcGxpdChcIi9cIik7XHJcbiAgICBjb25zdCBwYXRoMjogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGlmIChzZWdtZW50c1tpXSA9PT0gXCIuLlwiKSB7XHJcbiAgICAgICAgcGF0aDIucG9wKCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcGF0aDIucHVzaChzZWdtZW50c1tpXSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcGF0aDIuam9pbihcIi9cIik7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgc2hvd09wZW5EaWFsb2codGl0bGU6IHN0cmluZywgYXJncyA9IG5ldyBGaWxlRGlhbG9nQXJncygpKTogUHJvbWlzZTxGaWxlUGF0aFtdPiB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbXBsZW1lbnQgbWVcIik7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgc2hvd1NhdmVEaWFsb2coXHJcbiAgICB0aXRsZTogc3RyaW5nLFxyXG4gICAgc2F2ZWRhdGFfY2I6ICgpID0+IHVua25vd24sXHJcbiAgICBhcmdzID0gbmV3IEZpbGVEaWFsb2dBcmdzKClcclxuICApOiBQcm9taXNlPEZpbGVQYXRoPiB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbXBsZW1lbnQgbWVcIik7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgcmVhZEZpbGUocGF0aDogc3RyaW5nIHwgRmlsZVBhdGgsIG1pbWU/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IEFycmF5QnVmZmVyPiB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbXBsZW1lbnQgbWVcIik7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRmlsZURpYWxvZ0FyZ3Mge1xyXG4gIG11bHRpID0gZmFsc2U7XHJcbiAgYWRkVG9SZWNlbnRMaXN0ID0gZmFsc2U7XHJcbiAgZGVmYXVsdFBhdGg/OiBzdHJpbmc7XHJcbiAgZmlsdGVyczogeyBuYW1lOiBzdHJpbmc7IG1pbWU6IHN0cmluZzsgZXh0ZW5zaW9uczogc3RyaW5nW10gfVtdID0gW107XHJcbn1cclxuXHJcbi8qYSBmaWxlIHBhdGgsIHNvbWUgcGxhdGZvcm1zIG1heSBub3QgcmV0dXJuIHJlYWwgcGF0aHMqL1xyXG5leHBvcnQgY2xhc3MgRmlsZVBhdGgge1xyXG4gIGRhdGE6IHVua25vd247XHJcbiAgZmlsZW5hbWU6IHN0cmluZztcclxuXHJcbiAgY29uc3RydWN0b3IoZGF0YTogdW5rbm93biwgZmlsZW5hbWUgPSBcInVubmFtZWRcIikge1xyXG4gICAgdGhpcy5kYXRhID0gZGF0YTtcclxuICAgIHRoaXMuZmlsZW5hbWUgPSBmaWxlbmFtZTtcclxuICB9XHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFPLElBQU0sVUFBa0M7QUFBQSxFQUM3QyxPQUFTO0FBQUEsRUFDVCxTQUFTO0FBQUEsRUFD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

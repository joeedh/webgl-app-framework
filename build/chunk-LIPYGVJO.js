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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc2NyaXB0cy9wYXRoLnV4L3NjcmlwdHMvcGxhdGZvcm1zL3BsYXRmb3JtX2Jhc2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImV4cG9ydCBjb25zdCBtaW1lTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gIFwiLmpzXCIgIDogXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCIsXHJcbiAgXCIuanNvblwiOiBcInRleHQvanNvblwiLFxyXG4gIFwiLmh0bWxcIjogXCJ0ZXh0L2h0bWxcIixcclxuICBcIi50eHRcIiA6IFwidGV4dC9wbGFpblwiLFxyXG4gIFwiLmpwZ1wiIDogXCJpbWFnZS9qcGVnXCIsXHJcbiAgXCIucG5nXCIgOiBcImltYWdlL3BuZ1wiLFxyXG4gIFwiLnRpZmZcIjogXCJpbWFnZS90aWZmXCIsXHJcbiAgXCIuZ2lmXCIgOiBcImltYWdlL2dpZlwiLFxyXG4gIFwiLmJtcFwiIDogXCJpbWFnZS9iaXRtYXBcIixcclxuICBcIi50Z2FcIiA6IFwiaW1hZ2UvdGFyZ2FcIixcclxuICBcIi5zdmdcIiA6IFwiaW1hZ2Uvc3ZnK3htbFwiLFxyXG4gIFwiLnhtbFwiIDogXCJ0ZXh0L3htbFwiLFxyXG4gIFwiLndlYnBcIjogXCJpbWFnZS93ZWJwXCIsXHJcbiAgXCJzdmdcIiAgOiBcImltYWdlL3N2Zyt4bWxcIixcclxuICBcInR4dFwiICA6IFwidGV4dC9wbGFpblwiLFxyXG4gIFwiaHRtbFwiIDogXCJ0ZXh0L2h0bWxcIixcclxuICBcImNzc1wiICA6IFwidGV4dC9jc3NcIixcclxuICBcInRzXCIgICA6IFwiYXBwbGljYXRpb24vdHlwZXNjcmlwdFwiLFxyXG4gIFwicHlcIiAgIDogXCJhcHBsaWNhdGlvbi9weXRob25cIixcclxuICBcImNcIiAgICA6IFwiYXBwbGljYXRpb24vY1wiLFxyXG4gIFwiY3BwXCIgIDogXCJhcHBsaWNhdGlvbi9jcHBcIixcclxuICBcImNjXCIgICA6IFwiYXBwbGljYXRpb24vY3BwXCIsXHJcbiAgXCJoXCIgICAgOiBcImFwcGxpY2F0aW9uL2NcIixcclxuICBcImhoXCIgICA6IFwiYXBwbGljYXRpb24vY3BwXCIsXHJcbiAgXCJocHBcIiAgOiBcImFwcGxpY2F0aW9uL2NwcFwiLFxyXG4gIFwic2hcIiAgIDogXCJhcHBsaWNhdGlvbi9iYXNoXCIsXHJcbiAgXCJtanNcIiAgOiBcImFwcGxpY2F0aW9uL2phdmFzY3JpcHRcIixcclxuICBcImNqc1wiICA6IFwiYXBwbGljYXRpb24vamF2YXNjcmlwdFwiLFxyXG4gIFwiZ2lmXCIgIDogXCJpbWFnZS9naWZcIixcclxufTtcclxuXHJcbmV4cG9ydCB2YXIgdGV4dE1pbWVzID0gbmV3IFNldChbXHJcbiAgXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCIsXHJcbiAgXCJhcHBsaWNhdGlvbi94LWphdnNjcmlwdFwiLFxyXG4gIFwiaW1hZ2Uvc3ZnK3htbFwiLFxyXG4gIFwiYXBwbGljYXRpb24veG1sXCIsXHJcbl0pO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzTWltZVRleHQobWltZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XHJcbiAgaWYgKCFtaW1lKSB7XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG5cclxuICBpZiAobWltZS5zdGFydHNXaXRoKFwidGV4dFwiKSkge1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gdGV4dE1pbWVzLmhhcyhtaW1lKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEV4dGVuc2lvbihwYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcclxuICBpZiAoIXBhdGgpIHtcclxuICAgIHJldHVybiBcIlwiO1xyXG4gIH1cclxuXHJcbiAgbGV0IGkgPSBwYXRoLmxlbmd0aDtcclxuICB3aGlsZSAoaSA+IDAgJiYgcGF0aFtpXSAhPT0gXCIuXCIpIHtcclxuICAgIGktLTtcclxuICB9XHJcblxyXG4gIHJldHVybiBwYXRoLnNsaWNlKGksIHBhdGgubGVuZ3RoKS50cmltKCkudG9Mb3dlckNhc2UoKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldE1pbWUocGF0aDogc3RyaW5nKSB7XHJcbiAgbGV0IGV4dCA9IGdldEV4dGVuc2lvbihwYXRoKTtcclxuICBpZiAoZXh0IGluIG1pbWVNYXApIHtcclxuICAgIHJldHVybiBtaW1lTWFwW2V4dF07XHJcbiAgfVxyXG5cclxuICByZXR1cm4gXCJhcHBsaWNhdGlvbi94LW9jdGV0LXN0cmVhbVwiO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgUGxhdGZvcm1BUEkge1xyXG4gIHN0YXRpYyB3cml0ZUZpbGUoZGF0YTogQXJyYXlCdWZmZXIgfCBzdHJpbmcsIGhhbmRsZTogRmlsZVBhdGgsIG1pbWU6IHN0cmluZyk6IFByb21pc2U8dW5rbm93bj4ge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiaW1wbGVtZW50IG1lXCIpO1xyXG4gIH1cclxuXHJcbiAgc3RhdGljIHJlc29sdmVVUkwocGF0aDogc3RyaW5nLCBiYXNlID0gbG9jYXRpb24uaHJlZikge1xyXG4gICAgYmFzZSA9IGJhc2UudHJpbSgpO1xyXG5cclxuICAgIGlmIChwYXRoLnN0YXJ0c1dpdGgoXCIuL1wiKSkge1xyXG4gICAgICBwYXRoID0gcGF0aC5zbGljZSgyLCBwYXRoLmxlbmd0aCkudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHdoaWxlIChwYXRoLnN0YXJ0c1dpdGgoXCIvXCIpKSB7XHJcbiAgICAgIHBhdGggPSBwYXRoLnNsaWNlKDEsIHBhdGgubGVuZ3RoKS50cmltKCk7XHJcbiAgICB9XHJcblxyXG4gICAgd2hpbGUgKGJhc2UuZW5kc1dpdGgoXCIvXCIpKSB7XHJcbiAgICAgIGJhc2UgPSBiYXNlLnNsaWNlKDAsIGJhc2UubGVuZ3RoIC0gMSkudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBleHRzID0gW1wiaHRtbFwiLCBcInR4dFwiLCBcImpzXCIsIFwicGhwXCIsIFwiY2dpXCJdO1xyXG4gICAgZm9yIChsZXQgZXh0IG9mIGV4dHMpIHtcclxuICAgICAgZXh0ID0gXCIuXCIgKyBleHQ7XHJcbiAgICAgIGlmIChiYXNlLmVuZHNXaXRoKGV4dCkpIHtcclxuICAgICAgICBsZXQgaSA9IGJhc2UubGVuZ3RoIC0gMTtcclxuICAgICAgICB3aGlsZSAoaSA+IDAgJiYgYmFzZVtpXSAhPT0gXCIvXCIpIHtcclxuICAgICAgICAgIGktLTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGJhc2UgPSBiYXNlLnNsaWNlKDAsIGkpLnRyaW0oKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHdoaWxlIChiYXNlLmVuZHNXaXRoKFwiL1wiKSkge1xyXG4gICAgICBiYXNlID0gYmFzZS5zbGljZSgwLCBiYXNlLmxlbmd0aCAtIDEpLnRyaW0oKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzZWdtZW50cyA9IChiYXNlICsgXCIvXCIgKyBwYXRoKS5zcGxpdChcIi9cIik7XHJcbiAgICBjb25zdCBwYXRoMjogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGlmIChzZWdtZW50c1tpXSA9PT0gXCIuLlwiKSB7XHJcbiAgICAgICAgcGF0aDIucG9wKCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcGF0aDIucHVzaChzZWdtZW50c1tpXSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcGF0aDIuam9pbihcIi9cIik7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgc2hvd09wZW5EaWFsb2codGl0bGU6IHN0cmluZywgYXJncyA9IG5ldyBGaWxlRGlhbG9nQXJncygpKTogUHJvbWlzZTxGaWxlUGF0aFtdPiB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbXBsZW1lbnQgbWVcIik7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgc2hvd1NhdmVEaWFsb2codGl0bGU6IHN0cmluZywgc2F2ZWRhdGFfY2I6ICgpID0+IHVua25vd24sIGFyZ3MgPSBuZXcgRmlsZURpYWxvZ0FyZ3MoKSk6IFByb21pc2U8RmlsZVBhdGg+IHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcImltcGxlbWVudCBtZVwiKTtcclxuICB9XHJcblxyXG4gIHN0YXRpYyByZWFkRmlsZShwYXRoOiBzdHJpbmcgfCBGaWxlUGF0aCwgbWltZT86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgQXJyYXlCdWZmZXI+IHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcImltcGxlbWVudCBtZVwiKTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBGaWxlRGlhbG9nQXJncyB7XHJcbiAgbXVsdGkgPSBmYWxzZTtcclxuICBhZGRUb1JlY2VudExpc3QgPSBmYWxzZTtcclxuICBkZWZhdWx0UGF0aD86IHN0cmluZztcclxuICBmaWx0ZXJzOiB7IG5hbWU6IHN0cmluZzsgbWltZTogc3RyaW5nOyBleHRlbnNpb25zOiBzdHJpbmdbXSB9W10gPSBbXTtcclxufVxyXG5cclxuLyphIGZpbGUgcGF0aCwgc29tZSBwbGF0Zm9ybXMgbWF5IG5vdCByZXR1cm4gcmVhbCBwYXRocyovXHJcbmV4cG9ydCBjbGFzcyBGaWxlUGF0aCB7XHJcbiAgZGF0YTogdW5rbm93bjtcclxuICBmaWxlbmFtZTogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3RvcihkYXRhOiB1bmtub3duLCBmaWxlbmFtZSA9IFwidW5uYW1lZFwiKSB7XHJcbiAgICB0aGlzLmRhdGEgPSBkYXRhO1xyXG4gICAgdGhpcy5maWxlbmFtZSA9IGZpbGVuYW1lO1xyXG4gIH1cclxufVxyXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQU8sSUFBTSxVQUFrQztBQUFBLEVBQzdDLE9BQVM7QUFBQSxFQUNULFNBQVM7QUFBQSxFQUNULFNBQVM7QUFBQSxFQUNULFFBQVM7QUFBQSxF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

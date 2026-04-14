import {
  __export,
  __name
} from "./chunk-LIPYGVJO.js";

// scripts/path.ux/scripts/path-controller/util/html5_fileapi.ts
var html5_fileapi_exports = {};
__export(html5_fileapi_exports, {
  loadFile: () => loadFile,
  saveFile: () => saveFile
});
function saveFile(data, filename = "unnamed", _exts = [], mime = "application/x-octet-stream") {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.setAttribute("href", url);
  a.setAttribute("download", filename);
  a.click();
}
__name(saveFile, "saveFile");
function loadFile(_filename = "unnamed", exts = []) {
  const input = document.createElement("input");
  input.type = "file";
  const acceptStr = exts.join(",");
  input.setAttribute("accept", acceptStr);
  return new Promise((accept, reject) => {
    input.onchange = function() {
      if (input.files === null || input.files.length !== 1) {
        reject("file load error");
        return;
      }
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = function(e2) {
        accept(e2.target.result);
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  });
}
__name(loadFile, "loadFile");
window._testLoadFile = function(exts = ["*.*"]) {
  loadFile(void 0, exts).then((data) => {
    console.log("got file data:", data);
  });
};
window._testSaveFile = function() {
  const buf = window._appstate.createFile();
  saveFile(buf, "unnamed.w3d", [".w3d"]);
};

export {
  saveFile,
  loadFile,
  html5_fileapi_exports
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc2NyaXB0cy9wYXRoLnV4L3NjcmlwdHMvcGF0aC1jb250cm9sbGVyL3V0aWwvaHRtbDVfZmlsZWFwaS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGZ1bmN0aW9uIHNhdmVGaWxlKFxyXG4gIGRhdGE6IEJsb2JQYXJ0LFxyXG4gIGZpbGVuYW1lOiBzdHJpbmcgPSBcInVubmFtZWRcIixcclxuICBfZXh0czogc3RyaW5nW10gPSBbXSxcclxuICBtaW1lOiBzdHJpbmcgPSBcImFwcGxpY2F0aW9uL3gtb2N0ZXQtc3RyZWFtXCJcclxuKTogdm9pZCB7XHJcbiAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtkYXRhXSwgeyB0eXBlOiBtaW1lIH0pO1xyXG4gIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XHJcblxyXG4gIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKTtcclxuICBhLnNldEF0dHJpYnV0ZShcImhyZWZcIiwgdXJsKTtcclxuICBhLnNldEF0dHJpYnV0ZShcImRvd25sb2FkXCIsIGZpbGVuYW1lKTtcclxuXHJcbiAgYS5jbGljaygpO1xyXG59XHJcblxyXG4vL3JldHVybnMgYSBwcm9taXNlXHJcbmV4cG9ydCBmdW5jdGlvbiBsb2FkRmlsZShfZmlsZW5hbWU6IHN0cmluZyA9IFwidW5uYW1lZFwiLCBleHRzOiBzdHJpbmdbXSA9IFtdKTogUHJvbWlzZTxzdHJpbmcgfCBBcnJheUJ1ZmZlciB8IG51bGw+IHtcclxuICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcclxuICBpbnB1dC50eXBlID0gXCJmaWxlXCI7XHJcblxyXG4gIGNvbnN0IGFjY2VwdFN0ciA9IGV4dHMuam9pbihcIixcIik7XHJcblxyXG4gIGlucHV0LnNldEF0dHJpYnV0ZShcImFjY2VwdFwiLCBhY2NlcHRTdHIpO1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgoYWNjZXB0LCByZWplY3QpID0+IHtcclxuICAgIGlucHV0Lm9uY2hhbmdlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICBpZiAoaW5wdXQuZmlsZXMgPT09IG51bGwgfHwgaW5wdXQuZmlsZXMubGVuZ3RoICE9PSAxKSB7XHJcbiAgICAgICAgcmVqZWN0KFwiZmlsZSBsb2FkIGVycm9yXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZmlsZSA9IGlucHV0LmZpbGVzWzBdO1xyXG4gICAgICBjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xyXG5cclxuICAgICAgcmVhZGVyLm9ubG9hZCA9IGZ1bmN0aW9uIChlMjogUHJvZ3Jlc3NFdmVudDxGaWxlUmVhZGVyPikge1xyXG4gICAgICAgIGFjY2VwdChlMi50YXJnZXQhLnJlc3VsdCk7XHJcbiAgICAgIH07XHJcblxyXG4gICAgICByZWFkZXIucmVhZEFzQXJyYXlCdWZmZXIoZmlsZSk7XHJcbiAgICB9O1xyXG4gICAgaW5wdXQuY2xpY2soKTtcclxuICB9KTtcclxufVxyXG5cclxud2luZG93Ll90ZXN0TG9hZEZpbGUgPSBmdW5jdGlvbiAoZXh0czogc3RyaW5nW10gPSBbXCIqLipcIl0pOiB2b2lkIHtcclxuICBsb2FkRmlsZSh1bmRlZmluZWQsIGV4dHMpLnRoZW4oKGRhdGEpID0+IHtcclxuICAgIGNvbnNvbGUubG9nKFwiZ290IGZpbGUgZGF0YTpcIiwgZGF0YSk7XHJcbiAgfSk7XHJcbn07XHJcblxyXG53aW5kb3cuX3Rlc3RTYXZlRmlsZSA9IGZ1bmN0aW9uICgpOiB2b2lkIHtcclxuICBjb25zdCBidWYgPSAod2luZG93IGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgeyBjcmVhdGVGaWxlKCk6IEJsb2JQYXJ0IH0+KS5fYXBwc3RhdGUuY3JlYXRlRmlsZSgpO1xyXG4gIHNhdmVGaWxlKGJ1ZiwgXCJ1bm5hbWVkLnczZFwiLCBbXCIudzNkXCJdKTtcclxufTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFPLFNBQVMsU0FDZCxNQUNBLFdBQW1CLFdBQ25CLFFBQWtCLENBQUMsR0FDbkIsT0FBZSw4QkFDVDtBQUNOLFFBQU0sT0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLEdBQUcsRUFBRSxNQUFNLEtBQUssQ0FBQztBQUM1QyxRQUFNLE1BQU0sSUFBSSxnQkFBZ0IsSUFBSTtBQUVwQyxRQUFNLElBQUksU0FBUyxjQUFjLEdBQUc7QUFDcEMsSUFBRSxhQUFhLFFBQVEsR0FBRztBQUMxQixJQUFFLGFBQWEsWUFBWSxRQUFRO0FBRW5DLElBQUUsTUFBTTtBQUNWO0FBZGdCO0FBaUJULFNBQVMsU0FBUyxZQUFvQixXQUFXLE9BQWlCLENBQUMsR0FBeUM7QUFDakgsUUFBTSxRQUFRLFNBQVMsY0FBYyxPQUFPO0FBQzVDLFFBQU0sT0FBTztBQUViLFFBQU0sWUFBWSxLQUFLLEtBQUssR0FBRztBQUUvQixRQUFNLGFBQWEsVUFBVSxTQUFTO0FBQ3RDLFNBQU8sSUFBSSxRQUFRLENBQUMsUUFBUSxXQUFXO0FBQ3JDLFVBQU0sV0FBVyxXQUFZO0FBQzNCLFVBQUksTUFBTSxVQUFVLFFBQVEsTUFBTSxNQUFNLFdBQVcsR0FBRztBQUNwRCxlQUFPLGlCQUFpQjtBQUN4QjtBQUFBLE1BQ0Y7QUFFQSxZQUFNLE9BQU8sTUFBTSxNQUFNLENBQUM7QUFDMUIsWUFBTSxTQUFTLElBQUksV0FBVztBQUU5QixhQUFPLFNBQVMsU0FBVSxJQUErQjtBQUN2RCxlQUFPLEdBQUcsT0FBUSxNQUFNO0FBQUEsTUFDMUI7QUFFQSxhQUFPLGtCQUFrQixJQUFJO0FBQUEsSUFDL0I7QUFDQSxVQUFNLE1BQU07QUFBQSxFQUNkLENBQUM7QUFDSDtBQXpCZ0I7QUEyQmhCLE9BQU8sZ0JBQWdCLFNBQVUsT0FBaUIsQ0FBQyxLQUFLLEdBQVM7QUFDL0QsV0FBUyxRQUFXLElBQUksRUFBRSxLQUFLLENBQUMsU0FBUztBQUN2QyxZQUFRLElBQUksa0JBQWtCLElBQUk7QUFBQSxFQUNwQyxDQUFDO0FBQ0g7QUFFQSxPQUFPLGdCQUFnQixXQUFrQjtBQUN2QyxRQUFNLE1BQU8sT0FBaUUsVUFBVSxXQUFXO0FBQ25HLFdBQVMsS0FBSyxlQUFlLENBQUMsTUFBTSxDQUFDO0FBQ3ZDOyIsCiAgIm5hbWVzIjogW10KfQo=

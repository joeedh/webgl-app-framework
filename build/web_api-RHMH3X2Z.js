import {
  saveFile
} from "./chunk-ZS4VXPIE.js";
import {
  FileDialogArgs,
  FilePath,
  PlatformAPI,
  __name,
  isMimeText,
  mimeMap
} from "./chunk-LIPYGVJO.js";

// scripts/path.ux/scripts/platforms/web/web_api.ts
function getWebFilters(filters = []) {
  let types = [];
  for (let item of filters) {
    let mime = item.mime;
    let exts = [];
    for (let ext of item.extensions) {
      ext = "." + ext;
      if (ext.toLowerCase() in mimeMap) {
        mime = mime !== void 0 ? mime : mimeMap[ext.toLowerCase()];
      }
      exts.push(ext);
    }
    if (!mime) {
      mime = "application/x-octet-stream";
    }
    types.push({
      description: item.name,
      accept: {
        [mime]: exts
      }
    });
  }
  return types;
}
__name(getWebFilters, "getWebFilters");
var platform = class extends PlatformAPI {
  static {
    __name(this, "platform");
  }
  //returns a promise
  static showOpenDialog(title, args = new FileDialogArgs()) {
    let types = getWebFilters(args.filters);
    return new Promise((accept, reject) => {
      try {
        window.showOpenFilePicker({
          multiple: args.multi,
          types
        }).then((arg) => {
          let paths = [];
          for (let file of arg) {
            paths.push(new FilePath(file, file.name));
          }
          accept(paths);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  static writeFile(data, handle, mime) {
    handle = handle.data;
    return handle.createWritable().then((file) => {
      file.write(data);
      file.close();
    });
  }
  static showSaveDialog(title, savedata_cb, args = new FileDialogArgs()) {
    if (!window.showSaveFilePicker) {
      return this.showSaveDialog_old(title, savedata_cb, args);
    }
    let types = getWebFilters(args.filters);
    return new Promise((accept, reject) => {
      let fname;
      let saveHandle;
      try {
        saveHandle = window.showSaveFilePicker({ types });
      } catch (error) {
        reject(error);
      }
      let handle;
      saveHandle.then((handle1) => {
        handle = handle1;
        fname = handle.name;
        console.log("saveHandle", handle);
        return handle.createWritable();
      }).then((file) => {
        let savedata = savedata_cb();
        if (savedata instanceof Uint8Array || savedata instanceof DataView) {
          savedata = savedata.buffer;
        }
        file.write(savedata);
        file.close();
        let path = new FilePath(handle, fname);
        accept(path);
      });
    });
  }
  //returns a promise
  static showSaveDialog_old(title, savedata, args = new FileDialogArgs()) {
    let exts = [];
    for (let list of args.filters) {
      if (!Array.isArray(list) && list.filters) {
        list = list.filters;
      }
      for (let ext of list) {
        exts.push(ext);
      }
    }
    return new Promise((accept, reject) => {
      saveFile(savedata);
      window.setTimeout(() => {
        accept(void 0);
      });
    });
  }
  //path is a FilePath instance, for web this is the actual file data
  static readFile(path, mime = "") {
    if (mime === "") {
      mime = path.filename;
      let i = mime.length - 1;
      while (i > 0 && mime[i] !== ".") {
        i--;
      }
      mime = mime.slice(i, mime.length).trim().toLowerCase();
      if (mime in mimeMap) {
        mime = mimeMap[mime];
      }
    }
    return new Promise((accept, reject) => {
      path.data.getFile().then((file) => {
        console.log("file!", file);
        let promise;
        if (isMimeText(mime)) {
          promise = file.text();
        } else {
          promise = file.arrayBuffer();
        }
        promise.then((data) => {
          accept(data);
        });
      });
    });
  }
};
export {
  getWebFilters,
  platform
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc2NyaXB0cy9wYXRoLnV4L3NjcmlwdHMvcGxhdGZvcm1zL3dlYi93ZWJfYXBpLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBQbGF0Zm9ybUFQSSwgaXNNaW1lVGV4dCB9IGZyb20gXCIuLi9wbGF0Zm9ybV9iYXNlLmpzXCI7XHJcbmltcG9ydCB7IHNhdmVGaWxlLCBsb2FkRmlsZSB9IGZyb20gXCIuLi8uLi9wYXRoLWNvbnRyb2xsZXIvdXRpbC9odG1sNV9maWxlYXBpLmpzXCI7XHJcblxyXG5pbXBvcnQgeyBGaWxlRGlhbG9nQXJncywgRmlsZVBhdGggfSBmcm9tIFwiLi4vcGxhdGZvcm1fYmFzZS5qc1wiO1xyXG5cclxuaW1wb3J0IHsgbWltZU1hcCB9IGZyb20gXCIuLi9wbGF0Zm9ybV9iYXNlLmpzXCI7XHJcblxyXG5pbnRlcmZhY2UgRmlsZUZpbHRlciB7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIG1pbWU/OiBzdHJpbmc7XHJcbiAgZXh0ZW5zaW9uczogc3RyaW5nW107XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRXZWJGaWx0ZXJzKGZpbHRlcnM6IEZpbGVGaWx0ZXJbXSA9IFtdKSB7XHJcbiAgbGV0IHR5cGVzOiB7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IGFjY2VwdDogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+IH1bXSA9IFtdO1xyXG5cclxuICBmb3IgKGxldCBpdGVtIG9mIGZpbHRlcnMpIHtcclxuICAgIGxldCBtaW1lID0gaXRlbS5taW1lO1xyXG4gICAgbGV0IGV4dHM6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgZm9yIChsZXQgZXh0IG9mIGl0ZW0uZXh0ZW5zaW9ucykge1xyXG4gICAgICBleHQgPSBcIi5cIiArIGV4dDtcclxuICAgICAgaWYgKGV4dC50b0xvd2VyQ2FzZSgpIGluIG1pbWVNYXApIHtcclxuICAgICAgICBtaW1lID0gbWltZSAhPT0gdW5kZWZpbmVkID8gbWltZSA6IChtaW1lTWFwIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4pW2V4dC50b0xvd2VyQ2FzZSgpXTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZXh0cy5wdXNoKGV4dCk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFtaW1lKSB7XHJcbiAgICAgIG1pbWUgPSBcImFwcGxpY2F0aW9uL3gtb2N0ZXQtc3RyZWFtXCI7XHJcbiAgICB9XHJcblxyXG4gICAgdHlwZXMucHVzaCh7XHJcbiAgICAgIGRlc2NyaXB0aW9uOiBpdGVtLm5hbWUsXHJcbiAgICAgIGFjY2VwdDoge1xyXG4gICAgICAgIFttaW1lXTogZXh0cyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHR5cGVzO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgcGxhdGZvcm0gZXh0ZW5kcyBQbGF0Zm9ybUFQSSB7XHJcbiAgLy9yZXR1cm5zIGEgcHJvbWlzZVxyXG4gIHN0YXRpYyBzaG93T3BlbkRpYWxvZyh0aXRsZTogc3RyaW5nLCBhcmdzID0gbmV3IEZpbGVEaWFsb2dBcmdzKCkpIHtcclxuICAgIGxldCB0eXBlcyA9IGdldFdlYkZpbHRlcnMoYXJncy5maWx0ZXJzKTtcclxuXHJcbiAgICByZXR1cm4gbmV3IFByb21pc2U8RmlsZVBhdGhbXT4oKGFjY2VwdCwgcmVqZWN0KSA9PiB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgKHdpbmRvdyBhcyBhbnkpXHJcbiAgICAgICAgICAuc2hvd09wZW5GaWxlUGlja2VyKHtcclxuICAgICAgICAgICAgbXVsdGlwbGU6IGFyZ3MubXVsdGksXHJcbiAgICAgICAgICAgIHR5cGVzLFxyXG4gICAgICAgICAgfSlcclxuICAgICAgICAgIC50aGVuKChhcmc6IGFueVtdKSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBwYXRoczogRmlsZVBhdGhbXSA9IFtdO1xyXG5cclxuICAgICAgICAgICAgZm9yIChsZXQgZmlsZSBvZiBhcmcpIHtcclxuICAgICAgICAgICAgICBwYXRocy5wdXNoKG5ldyBGaWxlUGF0aChmaWxlLCBmaWxlLm5hbWUpKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgYWNjZXB0KHBhdGhzKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgc3RhdGljIHdyaXRlRmlsZShkYXRhOiBhbnksIGhhbmRsZTogYW55LCBtaW1lOiBzdHJpbmcpIHtcclxuICAgIGhhbmRsZSA9IGhhbmRsZS5kYXRhO1xyXG5cclxuICAgIHJldHVybiBoYW5kbGUuY3JlYXRlV3JpdGFibGUoKS50aGVuKChmaWxlOiBhbnkpID0+IHtcclxuICAgICAgZmlsZS53cml0ZShkYXRhKTtcclxuICAgICAgZmlsZS5jbG9zZSgpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgc2hvd1NhdmVEaWFsb2codGl0bGU6IHN0cmluZywgc2F2ZWRhdGFfY2I6ICgpID0+IGFueSwgYXJncyA9IG5ldyBGaWxlRGlhbG9nQXJncygpKTogUHJvbWlzZTxGaWxlUGF0aD4ge1xyXG4gICAgaWYgKCEod2luZG93IGFzIGFueSkuc2hvd1NhdmVGaWxlUGlja2VyKSB7XHJcbiAgICAgIHJldHVybiB0aGlzLnNob3dTYXZlRGlhbG9nX29sZCh0aXRsZSwgc2F2ZWRhdGFfY2IsIGFyZ3MpO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCB0eXBlcyA9IGdldFdlYkZpbHRlcnMoYXJncy5maWx0ZXJzKTtcclxuXHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKGFjY2VwdCwgcmVqZWN0KSA9PiB7XHJcbiAgICAgIGxldCBmbmFtZTogc3RyaW5nO1xyXG4gICAgICBsZXQgc2F2ZUhhbmRsZTogYW55O1xyXG5cclxuICAgICAgdHJ5IHtcclxuICAgICAgICBzYXZlSGFuZGxlID0gKHdpbmRvdyBhcyBhbnkpLnNob3dTYXZlRmlsZVBpY2tlcih7IHR5cGVzIH0pO1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCBoYW5kbGU6IGFueTtcclxuXHJcbiAgICAgIHNhdmVIYW5kbGVcclxuICAgICAgICAudGhlbigoaGFuZGxlMTogYW55KSA9PiB7XHJcbiAgICAgICAgICBoYW5kbGUgPSBoYW5kbGUxO1xyXG5cclxuICAgICAgICAgIGZuYW1lID0gaGFuZGxlLm5hbWU7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhcInNhdmVIYW5kbGVcIiwgaGFuZGxlKTtcclxuICAgICAgICAgIHJldHVybiBoYW5kbGUuY3JlYXRlV3JpdGFibGUoKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC50aGVuKChmaWxlOiBhbnkpID0+IHtcclxuICAgICAgICAgIGxldCBzYXZlZGF0YTogYW55ID0gc2F2ZWRhdGFfY2IoKTtcclxuXHJcbiAgICAgICAgICBpZiAoc2F2ZWRhdGEgaW5zdGFuY2VvZiBVaW50OEFycmF5IHx8IHNhdmVkYXRhIGluc3RhbmNlb2YgRGF0YVZpZXcpIHtcclxuICAgICAgICAgICAgc2F2ZWRhdGEgPSBzYXZlZGF0YS5idWZmZXI7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgZmlsZS53cml0ZShzYXZlZGF0YSk7XHJcbiAgICAgICAgICBmaWxlLmNsb3NlKCk7XHJcblxyXG4gICAgICAgICAgbGV0IHBhdGggPSBuZXcgRmlsZVBhdGgoaGFuZGxlLCBmbmFtZSk7XHJcbiAgICAgICAgICBhY2NlcHQocGF0aCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8vcmV0dXJucyBhIHByb21pc2VcclxuICBzdGF0aWMgc2hvd1NhdmVEaWFsb2dfb2xkKHRpdGxlOiBzdHJpbmcsIHNhdmVkYXRhOiBhbnksIGFyZ3MgPSBuZXcgRmlsZURpYWxvZ0FyZ3MoKSkge1xyXG4gICAgbGV0IGV4dHM6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgZm9yIChsZXQgbGlzdCBvZiBhcmdzLmZpbHRlcnMgYXMgYW55W10pIHtcclxuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3QpICYmIGxpc3QuZmlsdGVycykge1xyXG4gICAgICAgIGxpc3QgPSBsaXN0LmZpbHRlcnM7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZvciAobGV0IGV4dCBvZiBsaXN0KSB7XHJcbiAgICAgICAgZXh0cy5wdXNoKGV4dCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbmV3IFByb21pc2U8RmlsZVBhdGg+KChhY2NlcHQsIHJlamVjdCkgPT4ge1xyXG4gICAgICBzYXZlRmlsZShzYXZlZGF0YSk7XHJcblxyXG4gICAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgYWNjZXB0KHVuZGVmaW5lZCBhcyB1bmtub3duIGFzIEZpbGVQYXRoKTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8vcGF0aCBpcyBhIEZpbGVQYXRoIGluc3RhbmNlLCBmb3Igd2ViIHRoaXMgaXMgdGhlIGFjdHVhbCBmaWxlIGRhdGFcclxuICBzdGF0aWMgcmVhZEZpbGUocGF0aDogYW55LCBtaW1lID0gXCJcIik6IFByb21pc2U8c3RyaW5nIHwgQXJyYXlCdWZmZXI+IHtcclxuICAgIGlmIChtaW1lID09PSBcIlwiKSB7XHJcbiAgICAgIG1pbWUgPSBwYXRoLmZpbGVuYW1lO1xyXG4gICAgICBsZXQgaSA9IG1pbWUubGVuZ3RoIC0gMTtcclxuXHJcbiAgICAgIHdoaWxlIChpID4gMCAmJiBtaW1lW2ldICE9PSBcIi5cIikge1xyXG4gICAgICAgIGktLTtcclxuICAgICAgfVxyXG5cclxuICAgICAgbWltZSA9IG1pbWUuc2xpY2UoaSwgbWltZS5sZW5ndGgpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICBpZiAobWltZSBpbiBtaW1lTWFwKSB7XHJcbiAgICAgICAgbWltZSA9IChtaW1lTWFwIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4pW21pbWVdO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChhY2NlcHQsIHJlamVjdCkgPT4ge1xyXG4gICAgICBwYXRoLmRhdGEuZ2V0RmlsZSgpLnRoZW4oKGZpbGU6IGFueSkgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiZmlsZSFcIiwgZmlsZSk7XHJcblxyXG4gICAgICAgIGxldCBwcm9taXNlO1xyXG5cclxuICAgICAgICBpZiAoaXNNaW1lVGV4dChtaW1lKSkge1xyXG4gICAgICAgICAgcHJvbWlzZSA9IGZpbGUudGV4dCgpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBwcm9taXNlID0gZmlsZS5hcnJheUJ1ZmZlcigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcHJvbWlzZS50aGVuKChkYXRhOiBhbnkpID0+IHtcclxuICAgICAgICAgIGFjY2VwdChkYXRhKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7OztBQWFPLFNBQVMsY0FBYyxVQUF3QixDQUFDLEdBQUc7QUFDeEQsTUFBSSxRQUFxRSxDQUFDO0FBRTFFLFdBQVMsUUFBUSxTQUFTO0FBQ3hCLFFBQUksT0FBTyxLQUFLO0FBQ2hCLFFBQUksT0FBaUIsQ0FBQztBQUV0QixhQUFTLE9BQU8sS0FBSyxZQUFZO0FBQy9CLFlBQU0sTUFBTTtBQUNaLFVBQUksSUFBSSxZQUFZLEtBQUssU0FBUztBQUNoQyxlQUFPLFNBQVMsU0FBWSxPQUFRLFFBQW1DLElBQUksWUFBWSxDQUFDO0FBQUEsTUFDMUY7QUFFQSxXQUFLLEtBQUssR0FBRztBQUFBLElBQ2Y7QUFFQSxRQUFJLENBQUMsTUFBTTtBQUNULGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxLQUFLO0FBQUEsTUFDVCxhQUFhLEtB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

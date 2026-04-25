import {
  saveFile
} from "./chunk-SWZAU4MH.js";
import {
  FileDialogArgs,
  FilePath,
  PlatformAPI,
  __name,
  isMimeText,
  mimeMap
} from "./chunk-SCBSVA3H.js";

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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc2NyaXB0cy9wYXRoLnV4L3NjcmlwdHMvcGxhdGZvcm1zL3dlYi93ZWJfYXBpLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBQbGF0Zm9ybUFQSSwgaXNNaW1lVGV4dCB9IGZyb20gXCIuLi9wbGF0Zm9ybV9iYXNlXCI7XHJcbmltcG9ydCB7IHNhdmVGaWxlLCBsb2FkRmlsZSB9IGZyb20gXCIuLi8uLi9wYXRoLWNvbnRyb2xsZXIvdXRpbC9odG1sNV9maWxlYXBpXCI7XHJcblxyXG5pbXBvcnQgeyBGaWxlRGlhbG9nQXJncywgRmlsZVBhdGggfSBmcm9tIFwiLi4vcGxhdGZvcm1fYmFzZVwiO1xyXG5cclxuaW1wb3J0IHsgbWltZU1hcCB9IGZyb20gXCIuLi9wbGF0Zm9ybV9iYXNlXCI7XHJcblxyXG5pbnRlcmZhY2UgRmlsZUZpbHRlciB7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIG1pbWU/OiBzdHJpbmc7XHJcbiAgZXh0ZW5zaW9uczogc3RyaW5nW107XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRXZWJGaWx0ZXJzKGZpbHRlcnM6IEZpbGVGaWx0ZXJbXSA9IFtdKSB7XHJcbiAgbGV0IHR5cGVzOiB7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IGFjY2VwdDogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+IH1bXSA9IFtdO1xyXG5cclxuICBmb3IgKGxldCBpdGVtIG9mIGZpbHRlcnMpIHtcclxuICAgIGxldCBtaW1lID0gaXRlbS5taW1lO1xyXG4gICAgbGV0IGV4dHM6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgZm9yIChsZXQgZXh0IG9mIGl0ZW0uZXh0ZW5zaW9ucykge1xyXG4gICAgICBleHQgPSBcIi5cIiArIGV4dDtcclxuICAgICAgaWYgKGV4dC50b0xvd2VyQ2FzZSgpIGluIG1pbWVNYXApIHtcclxuICAgICAgICBtaW1lID0gbWltZSAhPT0gdW5kZWZpbmVkID8gbWltZSA6IChtaW1lTWFwIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4pW2V4dC50b0xvd2VyQ2FzZSgpXTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZXh0cy5wdXNoKGV4dCk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFtaW1lKSB7XHJcbiAgICAgIG1pbWUgPSBcImFwcGxpY2F0aW9uL3gtb2N0ZXQtc3RyZWFtXCI7XHJcbiAgICB9XHJcblxyXG4gICAgdHlwZXMucHVzaCh7XHJcbiAgICAgIGRlc2NyaXB0aW9uOiBpdGVtLm5hbWUsXHJcbiAgICAgIGFjY2VwdDoge1xyXG4gICAgICAgIFttaW1lXTogZXh0cyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHR5cGVzO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgcGxhdGZvcm0gZXh0ZW5kcyBQbGF0Zm9ybUFQSSB7XHJcbiAgLy9yZXR1cm5zIGEgcHJvbWlzZVxyXG4gIHN0YXRpYyBzaG93T3BlbkRpYWxvZyh0aXRsZTogc3RyaW5nLCBhcmdzID0gbmV3IEZpbGVEaWFsb2dBcmdzKCkpIHtcclxuICAgIGxldCB0eXBlcyA9IGdldFdlYkZpbHRlcnMoYXJncy5maWx0ZXJzKTtcclxuXHJcbiAgICByZXR1cm4gbmV3IFByb21pc2U8RmlsZVBhdGhbXT4oKGFjY2VwdCwgcmVqZWN0KSA9PiB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgKHdpbmRvdyBhcyBhbnkpXHJcbiAgICAgICAgICAuc2hvd09wZW5GaWxlUGlja2VyKHtcclxuICAgICAgICAgICAgbXVsdGlwbGU6IGFyZ3MubXVsdGksXHJcbiAgICAgICAgICAgIHR5cGVzLFxyXG4gICAgICAgICAgfSlcclxuICAgICAgICAgIC50aGVuKChhcmc6IGFueVtdKSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBwYXRoczogRmlsZVBhdGhbXSA9IFtdO1xyXG5cclxuICAgICAgICAgICAgZm9yIChsZXQgZmlsZSBvZiBhcmcpIHtcclxuICAgICAgICAgICAgICBwYXRocy5wdXNoKG5ldyBGaWxlUGF0aChmaWxlLCBmaWxlLm5hbWUpKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgYWNjZXB0KHBhdGhzKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgc3RhdGljIHdyaXRlRmlsZShkYXRhOiBhbnksIGhhbmRsZTogYW55LCBtaW1lOiBzdHJpbmcpIHtcclxuICAgIGhhbmRsZSA9IGhhbmRsZS5kYXRhO1xyXG5cclxuICAgIHJldHVybiBoYW5kbGUuY3JlYXRlV3JpdGFibGUoKS50aGVuKChmaWxlOiBhbnkpID0+IHtcclxuICAgICAgZmlsZS53cml0ZShkYXRhKTtcclxuICAgICAgZmlsZS5jbG9zZSgpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgc2hvd1NhdmVEaWFsb2coXHJcbiAgICB0aXRsZTogc3RyaW5nLFxyXG4gICAgc2F2ZWRhdGFfY2I6ICgpID0+IGFueSxcclxuICAgIGFyZ3MgPSBuZXcgRmlsZURpYWxvZ0FyZ3MoKVxyXG4gICk6IFByb21pc2U8RmlsZVBhdGg+IHtcclxuICAgIGlmICghKHdpbmRvdyBhcyBhbnkpLnNob3dTYXZlRmlsZVBpY2tlcikge1xyXG4gICAgICByZXR1cm4gdGhpcy5zaG93U2F2ZURpYWxvZ19vbGQodGl0bGUsIHNhdmVkYXRhX2NiLCBhcmdzKTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgdHlwZXMgPSBnZXRXZWJGaWx0ZXJzKGFyZ3MuZmlsdGVycyk7XHJcblxyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChhY2NlcHQsIHJlamVjdCkgPT4ge1xyXG4gICAgICBsZXQgZm5hbWU6IHN0cmluZztcclxuICAgICAgbGV0IHNhdmVIYW5kbGU6IGFueTtcclxuXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgc2F2ZUhhbmRsZSA9ICh3aW5kb3cgYXMgYW55KS5zaG93U2F2ZUZpbGVQaWNrZXIoeyB0eXBlcyB9KTtcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBsZXQgaGFuZGxlOiBhbnk7XHJcblxyXG4gICAgICBzYXZlSGFuZGxlXHJcbiAgICAgICAgLnRoZW4oKGhhbmRsZTE6IGFueSkgPT4ge1xyXG4gICAgICAgICAgaGFuZGxlID0gaGFuZGxlMTtcclxuXHJcbiAgICAgICAgICBmbmFtZSA9IGhhbmRsZS5uYW1lO1xyXG4gICAgICAgICAgY29uc29sZS5sb2coXCJzYXZlSGFuZGxlXCIsIGhhbmRsZSk7XHJcbiAgICAgICAgICByZXR1cm4gaGFuZGxlLmNyZWF0ZVdyaXRhYmxlKCk7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAudGhlbigoZmlsZTogYW55KSA9PiB7XHJcbiAgICAgICAgICBsZXQgc2F2ZWRhdGE6IGFueSA9IHNhdmVkYXRhX2NiKCk7XHJcblxyXG4gICAgICAgICAgaWYgKHNhdmVkYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSB8fCBzYXZlZGF0YSBpbnN0YW5jZW9mIERhdGFWaWV3KSB7XHJcbiAgICAgICAgICAgIHNhdmVkYXRhID0gc2F2ZWRhdGEuYnVmZmVyO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGZpbGUud3JpdGUoc2F2ZWRhdGEpO1xyXG4gICAgICAgICAgZmlsZS5jbG9zZSgpO1xyXG5cclxuICAgICAgICAgIGxldCBwYXRoID0gbmV3IEZpbGVQYXRoKGhhbmRsZSwgZm5hbWUpO1xyXG4gICAgICAgICAgYWNjZXB0KHBhdGgpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvL3JldHVybnMgYSBwcm9taXNlXHJcbiAgc3RhdGljIHNob3dTYXZlRGlhbG9nX29sZCh0aXRsZTogc3RyaW5nLCBzYXZlZGF0YTogYW55LCBhcmdzID0gbmV3IEZpbGVEaWFsb2dBcmdzKCkpIHtcclxuICAgIGxldCBleHRzOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIGZvciAobGV0IGxpc3Qgb2YgYXJncy5maWx0ZXJzIGFzIGFueVtdKSB7XHJcbiAgICAgIGlmICghQXJyYXkuaXNBcnJheShsaXN0KSAmJiBsaXN0LmZpbHRlcnMpIHtcclxuICAgICAgICBsaXN0ID0gbGlzdC5maWx0ZXJzO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmb3IgKGxldCBleHQgb2YgbGlzdCkge1xyXG4gICAgICAgIGV4dHMucHVzaChleHQpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPEZpbGVQYXRoPigoYWNjZXB0LCByZWplY3QpID0+IHtcclxuICAgICAgc2F2ZUZpbGUoc2F2ZWRhdGEpO1xyXG5cclxuICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgIGFjY2VwdCh1bmRlZmluZWQgYXMgdW5rbm93biBhcyBGaWxlUGF0aCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvL3BhdGggaXMgYSBGaWxlUGF0aCBpbnN0YW5jZSwgZm9yIHdlYiB0aGlzIGlzIHRoZSBhY3R1YWwgZmlsZSBkYXRhXHJcbiAgc3RhdGljIHJlYWRGaWxlKHBhdGg6IGFueSwgbWltZSA9IFwiXCIpOiBQcm9taXNlPHN0cmluZyB8IEFycmF5QnVmZmVyPiB7XHJcbiAgICBpZiAobWltZSA9PT0gXCJcIikge1xyXG4gICAgICBtaW1lID0gcGF0aC5maWxlbmFtZTtcclxuICAgICAgbGV0IGkgPSBtaW1lLmxlbmd0aCAtIDE7XHJcblxyXG4gICAgICB3aGlsZSAoaSA+IDAgJiYgbWltZVtpXSAhPT0gXCIuXCIpIHtcclxuICAgICAgICBpLS07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIG1pbWUgPSBtaW1lLnNsaWNlKGksIG1pbWUubGVuZ3RoKS50cmltKCkudG9Mb3dlckNhc2UoKTtcclxuICAgICAgaWYgKG1pbWUgaW4gbWltZU1hcCkge1xyXG4gICAgICAgIG1pbWUgPSAobWltZU1hcCBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KVttaW1lXTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgoYWNjZXB0LCByZWplY3QpID0+IHtcclxuICAgICAgcGF0aC5kYXRhLmdldEZpbGUoKS50aGVuKChmaWxlOiBhbnkpID0+IHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcImZpbGUhXCIsIGZpbGUpO1xyXG5cclxuICAgICAgICBsZXQgcHJvbWlzZTtcclxuXHJcbiAgICAgICAgaWYgKGlzTWltZVRleHQobWltZSkpIHtcclxuICAgICAgICAgIHByb21pc2UgPSBmaWxlLnRleHQoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgcHJvbWlzZSA9IGZpbGUuYXJyYXlCdWZmZXIoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHByb21pc2UudGhlbigoZGF0YTogYW55KSA9PiB7XHJcbiAgICAgICAgICBhY2NlcHQoZGF0YSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7QUFhTyxTQUFTLGNBQWMsVUFBd0IsQ0FBQyxHQUFHO0FBQ3hELE1BQUksUUFBcUUsQ0FBQztBQUUxRSxXQUFTLFFBQVEsU0FBUztBQUN4QixRQUFJLE9BQU8sS0FBSztBQUNoQixRQUFJLE9BQWlCLENBQUM7QUFFdEIsYUFBUyxPQUFPLEtBQUssWUFBWTtBQUMvQixZQUFNLE1BQU07QUFDWixVQUFJLElBQUksWUFBWSxLQUFLLFNBQVM7QUFDaEMsZUFBTyxTQUFTLFNBQVksT0FBUSxRQUFtQyxJQUFJLFlBQVksQ0FBQztBQUFBLE1BQzFGO0FBRUEsV0FBSyxLQUFLLEdBQUc7QUFBQSxJQUNmO0FBRUEsUUFBSSxDQUFDLE1BQU07QUFDVCxhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sS0FBSztB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

import {util, ToolStack, UndoFlags} from "../path.ux/scripts/pathux.js";

export class AppToolStack extends ToolStack {
  constructor(ctx) {
    super(ctx);

    this.enforceMemLimit = true;
    this.memLimit = 512*1024*1024;

    this._undo_branch = undefined;
  }

  _syncSettings(ctx) {
    let settings = ctx.settings;

    this.enforceMemLimit = settings.limitUndoMem;
    this.memLimit = settings.undoMemLimit*1024*1024;
    return this;
  }

  limitMemory(limit, ctx) {
    let mem = this.calcMemSize(ctx);

    mem = (mem/1024/1024).toFixed(3) + "mb";
    console.warn("Toolstack Memory:", mem);

    return super.limitMemory(limit, ctx);
  }

  execTool(ctx, toolop) {
    this._syncSettings(ctx); //sync undo settings

    if (this.enforceMemLimit) {
      this.limitMemory(this.memLimit, ctx);
    }

    if (!toolop.constructor.canRun(ctx, toolop)) {
      console.log("toolop.constructor.canRun returned false");
      return;
    }

    let tctx = ctx.toLocked();

    let undoflag = toolop.constructor.tooldef().undoflag;
    if (toolop.undoflag !== undefined) {
      undoflag = toolop.undoflag;
    }
    undoflag = undoflag === undefined ? 0 : undoflag;

    //if (!(undoflag & UndoFlags.IS_UNDO_ROOT) && !(undoflag & UndoFlags.NO_UNDO)) {
    //tctx = new SavedContext(ctx, ctx.datalib);
    //}

    toolop.execCtx = tctx;

    if (!(undoflag & UndoFlags.NO_UNDO)) {
      this.cur++;

      //save branch for if tool cancel
      this._undo_branch = this.slice(this.cur+1, this.length);

      //truncate
      this.length = this.cur+1;

      this[this.cur] = toolop;
      toolop.undoPre(tctx);
    }

    if (toolop.is_modal) {
      ctx = toolop.modal_ctx = ctx;

      this.modal_running = true;

      toolop._on_cancel = (function(toolop) {
        if (!(toolop.undoflag & UndoFlags.NO_UNDO)) {
          this.pop_i(this.cur);
          this.cur--;
        }
      }).bind(this);

      //will handle calling .exec itself
      toolop.modalStart(ctx);
    } else {
      toolop.execPre(tctx);
      toolop.exec(tctx);
      toolop.execPost(tctx);
      toolop.saveDefaultInputs();
    }
  }

  toolCancel(ctx, tool) {
    if (tool._was_redo) {
      //ignore tool cancel requests on redo
      return;
    }

    if (tool !== this[this.cur]) {
      console.warn("toolCancel called in error", this, tool);
      return;
    }

    this.undo();
    this.length = this.cur+1;

    if (this._undo_branch !== undefined) {
      for (let item of this._undo_branch) {
        this.push(item);
      }
    }
  }

  undo() {
    if (this.enforceMemLimit) {
      this.limitMemory(this.memLimit);
    }

    if (this.cur >= 0 && !(this[this.cur].undoflag & UndoFlags.IS_UNDO_ROOT)) {
      console.log("undo!");

      let tool = this[this.cur];

      tool.undo(tool.execCtx);

      this.cur--;
    }
  }

  replay(fromBasicFile=false) {
    this._syncSettings(this.ctx); //sync undo settings

    let cur = this.cur;

    if (fromBasicFile) {
      let toolstack = _appstate.toolstack;
      _appstate.toolstack = new AppToolStack(this.ctx);
      _genDefaultFile(_appstate, true);
      _appstate.toolstack = toolstack;
      toolstack.cur = -1;
    } else {
      this.rewind();
    }

    let last = this.cur;

    let start = util.time_ms();

    return new Promise((accept, reject) => {
      let next = () => {
        last = this.cur;

        this.redo();

        if (last === this.cur) {
          console.warn("time:", (util.time_ms() - start)/1000.0);
          accept(this);
        } else {
          window.redraw_viewport_p(true).then(() => {
            next();
          });
        }
      }

      next();
    });
  }

  redo() {
    this._syncSettings(this.ctx); //sync undo settings

    super.redo();

    console.log("redo!");
  }
}

import {ToolStack, UndoFlags} from "../path.ux/scripts/simple_toolsys.js";
import {ModalContext} from "./context.js";

export class AppToolStack extends ToolStack {
  constructor(ctx) {
    super(ctx);

    this._undo_branch = undefined;
  }

  execTool(toolop, ctx=this.ctx) {
    if (!toolop.constructor.canRun(ctx)) {
      console.log("toolop.constructor.canRun returned false");
      return;
    }

    let tctx = ctx;

    let undoflag = toolop.constructor.tooldef().undoflag;
    if (toolop.undoflag !== undefined) {
      undoflag = toolop.undoflag;
    }
    undoflag = undoflag === undefined ? 0 : undoflag;

    //if (!(undoflag & UndoFlags.IS_UNDO_ROOT) && !(undoflag & UndoFlags.NO_UNDO)) {
    //tctx = new SavedContext(ctx, ctx.datalib);
    //}

    toolop.execCtx = tctx;

    //console.log(undoflag, "undoflag");
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
      ctx = toolop.modal_ctx = new ModalContext(ctx.state);

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
    if (this.cur >= 0 && !(this[this.cur].undoflag & UndoFlags.IS_UNDO_ROOT)) {
      console.log("undo!", this.cur, this.length);

      let tool = this[this.cur];
      console.log(tool, tool.undo, "---");
      tool.undo(tool.execCtx);

      this.cur--;
    }
  }

  //reruns a tool if it's at the head of the stack
  rerun(tool) {
    if (tool === this[this.cur]) {
      this.undo();
      this.redo();
    } else {
      console.warn("Tool wasn't at head of stack", tool);
    }
  }

  redo() {
    console.log("redo!", this.cur, this.length);
    if (this.cur >= -1 && this.cur+1 < this.length) {
      //console.log("redo!", this.cur, this.length);

      this.cur++;
      let tool = this[this.cur];

      tool._was_redo = true;

      tool.undoPre(tool.execCtx);
      tool.execPre(tool.execCtx);
      tool.exec(tool.execCtx);
      tool.execPost(tool.execCtx);

      window.redraw_viewport();
    }
  }
}

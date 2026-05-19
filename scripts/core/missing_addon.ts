/**
 * Placeholders that preserve serialized data referencing classes whose addon
 * isn't currently loaded.
 *
 * Goal: if a file references a DataBlock / ToolMode / CustomDataElem subclass
 * from an addon that's been disabled or uninstalled, the load path substitutes
 * a placeholder that stashes the raw bytes from the file. On the next save we
 * re-emit those bytes verbatim under the original class name. When the addon
 * is later re-enabled and the file is re-loaded, the data round-trips back to
 * the real class without loss.
 *
 * Today this module provides:
 *   - `MissingDataBlock`: implementable purely at our load/save call sites in
 *     appstate.ts because the bytes + class name are already in hand there.
 *
 * Deferred (requires patching nstructjs's abstract-type reader; tracked in the
 * plan §4.2 — Add joeedh/STRUCT submodule):
 *   - `MissingToolMode`: scene.toolmodes is an `array(abstract(ToolMode))`,
 *     so the read failure happens inside nstructjs. Needs an `onUnknownClass`
 *     hook.
 *   - `OpaqueCustomDataElem`: customdata layers are `array(abstract(CustomDataElem))`,
 *     same story.
 *
 * The vendor/nstructjs submodule is in place; patching + rebuild lands as a
 * follow-up commit.
 */

import {DataBlock} from './lib_api.js'
import {nstructjs} from '../path.ux/scripts/pathux.js'

/**
 * Stand-in for a DataBlock whose class isn't registered (the addon that owned
 * it isn't loaded). Holds the raw on-disk bytes and the original class name so
 * appstate's writer can round-trip them on the next save.
 */
export class MissingDataBlock extends DataBlock {
  /** Original class name (e.g. "Mesh") that the load path tried to resolve. */
  _origClsname: string = ''

  /** Raw bytes that were intended for the original class's loadSTRUCT. */
  _origBytes: Uint8Array = new Uint8Array()

  static blockDefine() {
    return {
      typeName    : 'MissingDataBlock',
      defaultName : 'Missing Addon Data',
      uiName      : 'Missing',
      flag        : 0,
      icon        : -1,
    }
  }

  static STRUCT = nstructjs.inlineRegister(
    this,
    `
MissingDataBlock {
  _origClsname : string;
  _origBytes   : array(byte);
}
  `
  )

  /**
   * Helper used by appstate.ts during load when DataBlock.getClass returns
   * undefined. Builds a placeholder, copying the bytes out of the
   * just-read block-header so the writer can re-emit them.
   */
  static fromUnknownBlock(clsname: string, bytes: Uint8Array): MissingDataBlock {
    const block = new MissingDataBlock()
    block._origClsname = clsname
    block._origBytes = new Uint8Array(bytes)
    block.name = `Missing: ${clsname}`
    block.lib_type = clsname // pretend to be the original type for datalib bookkeeping
    return block
  }
}

DataBlock.register(MissingDataBlock)

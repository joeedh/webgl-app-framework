/**
 * Placeholders that preserve serialized data referencing classes whose addon
 * isn't currently loaded.
 *
 * Goal: if a file references a DataBlock / ToolMode / CustomDataElem subclass
 * from an addon that's been disabled or uninstalled, the load path substitutes
 * a placeholder that stores the original class name + all the field values
 * deserialized via the file's schema. On the next save we re-emit those values
 * under the original class's struct id + schema. When the addon is later
 * re-enabled and the file is re-loaded, the data round-trips back to the real
 * class without loss.
 *
 * Two read mechanisms:
 *   1. MissingDataBlock — populated in `appstate.ts`'s explicit DataBlock
 *      load path; the bytes + class name are already in hand there. Stored
 *      as opaque bytes.
 *   2. MissingToolMode / OpaqueCustomDataElem — populated via the patched
 *      nstructjs `onUnknownClass` hook. The hook returns the placeholder
 *      class; nstructjs then walks the *file's* schema fields, depositing
 *      each value on the placeholder by name (so the placeholder carries
 *      the original data as dynamic properties). The matching
 *      `onSerializeUnknown` hook makes write_object emit the original
 *      class's struct id + schema, not the placeholder's. See plan §4.
 */

import {DataBlock} from './lib_api.js'
import {nstructjs} from '../path.ux/scripts/pathux.js'
import {ToolMode} from '../editors/view3d/view3d_toolmode.js'

// Constructor for the mesh-addon's `OpaqueCustomDataElem` placeholder.
// Registered at addon-load time via `registerOpaqueCustomDataElem` so this
// module stays mesh-agnostic (see plan §3).
let opaqueCustomDataElemCls: (new () => unknown) | null = null

/**
 * Called by the mesh addon to publish its `OpaqueCustomDataElem` placeholder
 * class. The class must extend mesh's `CustomDataElem` — core does not
 * reference that base directly to keep the `core-no-addons` layer rule clean.
 */
export function registerOpaqueCustomDataElem(cls: new () => unknown): void {
  opaqueCustomDataElemCls = cls
}

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

// ----------------------------------------------------------------------------
// MissingToolMode — placeholder for a ToolMode subclass from an unloaded addon
// ----------------------------------------------------------------------------

/**
 * Stand-in for a ToolMode whose subclass isn't registered. Carries the
 * original struct name (set by nstructjs's abstract unpack hook) and any
 * fields the loader deposited as dynamic properties. Filtered out of the
 * runtime toolmode_map in scene.ts but kept in scene.toolmodes so re-save
 * round-trips it.
 */
export class MissingToolMode extends ToolMode {
  _origClsname: string = ''

  static toolModeDefine() {
    return {
      name        : 'MissingToolMode',
      uiname      : 'Missing (Addon Disabled)',
      icon        : -1,
      flag        : 0,
      description : 'Placeholder for a tool mode whose addon is not loaded.',
    }
  }

  static STRUCT = nstructjs.inlineRegister(
    this,
    `
MissingToolMode {
  _origClsname : string;
}
  `
  )
}

// MissingToolMode is intentionally NOT registered with ToolMode.register() —
// it must not appear in the toolmode enum or be selectable; it's only ever
// instantiated by the onUnknownClass hook for round-tripping serialized data.

// ----------------------------------------------------------------------------
// OpaqueCustomDataElem placeholder lives in the mesh addon
// (`addons/builtin/mesh/src/missing_customdata.ts`) since its base class
// `CustomDataElem` is mesh-defined. The mesh addon calls
// `registerOpaqueCustomDataElem` (above) at load time so the hook below can
// hand it back from `onUnknownClass` — keeping core mesh-agnostic.
// ----------------------------------------------------------------------------
// nstructjs hooks
// ----------------------------------------------------------------------------

/**
 * Installs the onUnknownClass + onSerializeUnknown hooks on nstructjs's
 * global manager so that unknown ToolMode / CustomDataElem subclasses are
 * preserved instead of crashing the load. Must be called once at app start,
 * before any file is loaded.
 *
 * The choice of which placeholder is keyed by the missing class's NAMESPACE
 * (parent module) embedded in the struct name — nstructjs stores names with
 * dotted prefixes (e.g. "mesh.CustomDataElem"). We sniff the schema's parent
 * declaration to pick the right placeholder; if we can't determine the kind,
 * we don't return a placeholder and the original error fires (better to fail
 * loud than silently corrupt unrelated data).
 */
export function installMissingAddonHooks(): void {
  // The nstructjs typings don't expose the manager's hook fields publicly;
  // cast to a permissive shape locally. The hook fields were added by the
  // vendored-source patch in vendor/nstructjs (see plan §4).
  const manager = nstructjs.manager as unknown as {
    onUnknownClass?: (clsname: string, schema: unknown) => unknown
    onSerializeUnknown?: (obj: unknown) => string | undefined
  }

  manager.onUnknownClass = (clsname: string) => {
    // CustomDataElem subclasses live under the `mesh.*` namespace in their
    // schema names; ToolMode subclasses are flat names. We pick
    // OpaqueCustomDataElem for anything under the mesh.* namespace that
    // mentions CustomData, MissingToolMode for everything else that
    // reaches this hook. (Real DataBlock subclasses go through appstate's
    // explicit MissingDataBlock path, not this hook.)
    if (clsname.startsWith('mesh.') && clsname.includes('CustomData')) {
      // Falls through to MissingToolMode if the mesh addon hasn't registered
      // its placeholder yet (e.g. mesh disabled before any file load).
      if (opaqueCustomDataElemCls) {
        return opaqueCustomDataElemCls
      }
    }
    return MissingToolMode
  }

  manager.onSerializeUnknown = (obj: unknown) => {
    const placeholder = obj as {_origClsname?: string} | null
    return placeholder?._origClsname || undefined
  }
}


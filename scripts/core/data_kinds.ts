/**
 * Registry of "data kinds" — the categories of data that can be attached to a
 * SceneObject. Today: 'mesh', 'curve', 'light', 'camera', 'tetmesh', 'litemesh',
 * 'strand', 'nullobject', ... Each scene-object data class declares its kind via
 * `dataDefine().dataKind`; the registry holds factory hooks, importers, and any
 * other per-kind plug-ins the framework needs.
 *
 * Core consumes this registry through callbacks instead of importing concrete
 * data classes; that lets the mesh subsystem (and any other) live in an addon.
 * See plan §3.
 */

import type {SceneObjectData} from '../sceneobject/sceneobject_base'
import type {ToolContext} from './context'

export interface IDataKindDescriptor {
  /** Stable kind id used by data files and ctx queries. */
  id: string

  /** Constructor for the data type (used by importers, default-factory hooks). */
  factory?: new () => SceneObjectData

  /** Imports a file of this kind. Receives the bytes, returns a new data instance. */
  importFromBytes?: (ctx: ToolContext, bytes: Uint8Array, filename?: string) => SceneObjectData | undefined

  /** Optional human-readable name for menus. */
  uiName?: string

  /** Optional list of file extensions this kind can import (e.g. ['.obj']). */
  importExtensions?: string[]
}

const _kinds = new Map<string, IDataKindDescriptor>()

export function registerDataKind(desc: IDataKindDescriptor): void {
  if (_kinds.has(desc.id)) {
    throw new Error(`data kind "${desc.id}" is already registered`)
  }
  _kinds.set(desc.id, desc)
}

export function unregisterDataKind(id: string): void {
  _kinds.delete(id)
}

export function getDataKind(id: string): IDataKindDescriptor | undefined {
  return _kinds.get(id)
}

export function listDataKinds(): IDataKindDescriptor[] {
  return Array.from(_kinds.values())
}

/** Test-only helper — clears the registry. Do not use from app code. */
export function _resetDataKindsForTests(): void {
  _kinds.clear()
}

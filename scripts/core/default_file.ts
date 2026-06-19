/**
 * Default-scene builder hook.
 *
 * Core only knows how to lay out an empty Scene with a Collection. Anything
 * mesh-shaped that needs to appear in the default scene (the classic startup
 * cube) is contributed via this callback, registered at startup by whichever
 * addon supplies the default data — currently the mesh subsystem.
 *
 * With no builder registered, the default scene is empty. See plan §3.
 */

import type {ToolContext} from './context'
import type {Library} from './lib_api'
import type {Scene} from '../scene/scene'

export type DefaultSceneBuilder = (ctx: ToolContext, lib: Library, scene: Scene) => void

let _builder: DefaultSceneBuilder | null = null

export function setDefaultSceneBuilder(fn: DefaultSceneBuilder | null): void {
  _builder = fn
}

let _defaultToolMode = 'object'

/** Toolmode the freshly-built default file activates (if that mode is
 * registered, else gen_default_file falls back to 'object'). Set by whichever
 * subsystem contributes the default scene. */
export function setDefaultToolMode(name: string): void {
  _defaultToolMode = name
}

export function getDefaultToolMode(): string {
  return _defaultToolMode
}

export function getDefaultSceneBuilder(): DefaultSceneBuilder | null {
  return _builder
}

export function buildDefaultSceneContents(ctx: ToolContext, lib: Library, scene: Scene): void {
  _builder?.(ctx, lib, scene)
}

/** Test-only helper. */
export function _resetDefaultSceneBuilderForTests(): void {
  _builder = null
}

import {Curve1D, SplineTemplates, util, Vector4} from '../path.ux/scripts/pathux.js'
import {Icons} from '../editors/icon_enum.js'
import {DataBlock, BlockFlags, BlockLoader, BlockLoaderAddUser} from '../core/lib_api.js'
import {NodeFlags} from '../core/graph.js'
import {
  CombModes,
  CombPattern,
  ProceduralTex,
  ProceduralTexUser,
  TexUserFlags,
  TexUserModes,
} from '../texture/proceduralTex'
import {nstructjs, Number4} from '../path.ux/pathux.js'
import type {Scene} from '../scene/scene.js'
import type {ToolContext} from '../core/context'
import type {StructReader} from '../path.ux/scripts/util/nstructjs.js'
import {BrushDynamics} from './brush_dynamics'
export {BrushDynamics} from './brush_dynamics'
import {SculptTools} from './brush_enums'
export * from './brush_enums'

function feq(a: number, b: number) {
  return Math.abs(a - b) < 0.00001
}

export const BrushSpacingModes = {
  NONE: 0,
  EVEN: 1,
}

export enum BrushFlags {
  SELECT = 1,
  SHARED_SIZE = 2,
  DYNTOPO = 4,
  INVERT_CONCAVE_FILTER = 8,
  MULTIGRID_SMOOTH = 16,
  PLANAR_SMOOTH = 32,
  CURVE_RAKE_ONLY_POS_X = 64, //for debugging purposes, restrict curavture raking to one side of the mesh
  INVERT = 128,
  LINE_FALLOFF = 256,
  SQUARE = 512,
  USE_LINE_CURVE = 1024,
  /* Accumulate deformation across passes within a stroke (Blender "Accumulate
   * on"). CLEAR (the default) = non-accumulate: each pass measures from the
   * vertex's stroke-start position so repeated passes converge. See
   * sculptcore/documentation/plans/nonAccumMode.md. Deform brushes only. */
  ACCUMULATE = 2048,
}

export enum DynTopoModes {
  SCREEN = 0,
  WORLD = 1,
}

export enum DynTopoFlags {
  SUBDIVIDE = 1,
  COLLAPSE = 2,
  ENABLED = 8,
  FANCY_EDGE_WEIGHTS = 16,
  QUAD_COLLAPSE = 32,
  ALLOW_VALENCE4 = 64,
  DRAW_TRIS_AS_QUADS = 128,
  ADAPTIVE = 256,
}

export enum DynTopoOverrides {
  //these are mirrored with DynTopoFlags
  SUBDIVIDE = 1,
  COLLAPSE = 2,
  //4 used to be INHERIT_DEFAULT, moved to DynTopoOverrides.NONE
  ENABLED = 8,
  FANCY_EDGE_WEIGHTS = 16,
  QUAD_COLLAPSE = 32,
  ALLOW_VALENCE4 = 64,
  DRAW_TRIS_AS_QUADS = 128,
  ADAPTIVE = 256,
  //end of DynTopoFlags mirror

  //these mirror properties instead of flags
  VALENCE_GOAL = 1 << 16,
  EDGE_SIZE = 1 << 17,
  DECIMATE_FACTOR = 1 << 18,
  SUBDIVIDE_FACTOR = 1 << 19,
  MAX_DEPTH = 1 << 20,
  EDGE_COUNT = 1 << 21,
  NONE = 1 << 22,
  REPEAT = 1 << 23,
  SPACING_MODE = 1 << 24,
  SPACING = 1 << 25,
  EDGEMODE = 1 << 26,
  SUBDIV_MODE = 1 << 27,
  EVERYTHING = ((1 << 27) - 1) & ~(1 << 22), //all flags except for NONE
}

export enum SubdivModes {
  SIMPLE = 0,
  SMART = 1,
}

// --- Sculptcore dynamic-topology settings (DynTopoSettingsSC) -----------------
// These back the sculptcore-native dyntopo path (brush_dyntopo_sc.ts), distinct
// from the legacy pbvh DynTopo* enums above. The mode enum mirrors the C++
// `sculptcore::dyntopo::DynTopoMode` int values so it maps 1:1 onto
// DynTopoParams.mode.

// How the per-dab target edge length (l_max) is resolved in TS. l_min is then
// l_max * collapseRatio. See DynTopoSettingsSC.resolveEdgeGoal.
export enum DynTopoEdgeModeSC {
  WORLD = 0, // edgeSize is a world-space (object-local) length
  PERCENT = 1, // edgeSize is a percentage of the brush radius
  PIXELS = 2, // edgeSize is a multiple of the projected pixel size at the dab
}

// Mirrors sculptcore::dyntopo::DynTopoMode (Subdivide=0, Collapse=1, Both=2).
export enum DynTopoSCMode {
  SUBDIVIDE = 0,
  COLLAPSE = 1,
  BOTH = 2,
}

export enum DynTopoFlagsSC {
  ENABLED = 1,
  DO_FLIPS = 2,
  DO_SMOOTH = 4,
  PRESERVE_FEATURES = 8,
}

export enum DynTopoOverridesSC {
  // Mirrored with DynTopoFlagsSC.
  ENABLED = 1,
  DO_FLIPS = 2,
  DO_SMOOTH = 4,
  PRESERVE_FEATURES = 8,
  // end DynTopoFlagsSC mirror

  // These mirror scalar/enum properties instead of flags.
  // (bit 15 sits in the free gap below the scalar block so NONE/EVERYTHING keep
  // their serialized bit values.)
  DYNTOPO_SPACING = 1 << 15,
  EDGE_MODE = 1 << 16,
  EDGE_SIZE = 1 << 17,
  COLLAPSE_RATIO = 1 << 18,
  GRADE = 1 << 19,
  MODE = 1 << 20,
  SMOOTH_LAMBDA = 1 << 21,
  MAX_SPLITS = 1 << 22,
  MAX_ROUNDS = 1 << 23,

  NONE = 1 << 24, // set => inherit everything from the tool-mode defaults
  EVERYTHING = (1 << 24) - 1, // all override bits except NONE
}

export const SculptIcons = {} as {[k: string]: number}
for (const k in SculptTools) {
  SculptIcons[k] = (Icons as any)['SCULPT_' + k]
}
// No dedicated iconsheet cell yet; reuse the draw-brush icon.
SculptIcons.LAYER_DRAW = Icons.SCULPT_DRAW

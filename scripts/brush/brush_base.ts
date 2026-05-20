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
}

export enum DynTopoModes {
  SCREEN = 0,
  WORLD = 1,
}

/*
Note: there are different types of brushes:
  + 'Draw' brushes move vertices along the surface normal at the center of the brush
  + 'Clay' brushes project vertices to the plane defined by the surface normal at the center of the brush
  + 'Smooth' brushes average vertex positions with their neighbors
  + 'Mask' brushes modify the mask value of vertices
  + 'Paint' brushes modify vertex colors
  + 'Grab' brushes directly move portions of the mesh in some way.
  + Other various special brushes exist (e.g. 'Snake', 'Topology', 'Hole Filler', etc.)
*/

export enum SculptTools {
  CLAY = 0,
  FILL = 1,
  SCRAPE = 2,
  SMOOTH = 3,
  DRAW = 4,
  SHARP = 5,
  INFLATE = 6,
  SNAKE = 7,
  TOPOLOGY = 8,
  GRAB = 9,
  HOLE_FILLER = 10,
  MASK_PAINT = 11,
  WING_SCRAPE = 12,
  PINCH = 13,
  DIRECTIONAL_FAIR = 14,
  SLIDE_RELAX = 15,
  BVH_DEFORM = 16,
  PAINT = 128,
  PAINT_SMOOTH = 129,
  COLOR_BOUNDARY = 130,
  TEXTURE_PAINT = 150,
  FACE_SET_DRAW = 151,
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

export const SculptIcons = {} as {[k: string]: number}
for (const k in SculptTools) {
  SculptIcons[k] = (Icons as any)['SCULPT_' + k]
}

import {nstructjs} from '../path.ux/scripts/pathux.js'

/**
 * Legacy struct-name migration for nstructjs inherit -> inlineRegister.
 *
 * Background: classes that used the deprecated `nstructjs.inherit(Child, Parent)`
 * form WITHOUT an explicit struct name registered under their bare class name
 * (e.g. `StrandSet`, `NumProperty`, `MeshEditor`). Because the bundler emits
 * those as `var X = class extends Y {}`, the runtime `.name` could even end up
 * collision-mangled (observed: `CurvVert2` -> `CurvVert22`, `DispLayerVert` ->
 * `DispLayerVert3`). Files saved by those builds embed the bare/mangled name in
 * their self-describing schema block.
 *
 * Those classes now register under stable module-qualified names via
 * `nstructjs.inlineRegister(this, `module.Class { ... }`)`. When loading a
 * legacy file, its embedded schema still names the structs by their old name,
 * so `STRUCT.parse_structs` cannot match them to the renamed classes and would
 * silently deserialize them into empty dummy classes (data loss).
 *
 * Fix: before `parse_structs`, rewrite the embedded schema by parsing it into
 * the nstructjs AST, renaming both struct DECLARATIONS and struct TYPE
 * REFERENCES (in `array(...)`, `iter(...)`, `abstract(...)`, `optional(...)`,
 * `static_array[...]`) through the map below, then re-emitting via the
 * canonical `STRUCT.fmt_struct` serializer. Struct *ids* are preserved, so the
 * binary body's polymorphic id->struct references keep resolving — only the
 * name attached to each id changes, which is exactly what lets `readObject`
 * find the renamed class.
 *
 * The map is keyed by every old name a file could contain (bare source name and,
 * where applicable, the collision-mangled bundle name). New module-qualified
 * names are never keys, so this pass is a no-op for files written after the
 * migration. Generated from `.migration-ref/name-map.json` (renamed entries).
 */
export const LEGACY_STRUCT_NAME_MAP: Record<string, string> = {
  BSplineCurve: 'curve1d.BSplineCurve',
  BVHToolMode: 'view3d.BVHToolMode',
  BoolProperty: 'toolprop.BoolProperty',
  BounceCurve: 'curve1d.BounceCurve',
  CodeEditor: 'code_editor.CodeEditor',
  CotanVert: 'mesh.CotanVert',
  CurvToolMode: 'curvetest.CurvToolMode',
  CurvVert: 'mesh.CurvVert',
  CurvVert2: 'mesh.CurvVert2',
  CurvVert22: 'mesh.CurvVert2',
  CurvVert2Settings: 'mesh.CurvVert2Settings',
  CurveToolBase: 'curve.CurveToolBase',
  DFieldElem: 'mesh.DFieldElem',
  DFieldSettings: 'mesh.DFieldSettings',
  DataPathBrowser: 'editors.DataPathBrowser',
  DispLayerSettings: 'mesh.DispLayerSettings',
  DispLayerVert: 'mesh.DispLayerVert',
  DispLayerVert3: 'mesh.DispLayerVert',
  DrawerEditor: 'editors.DrawerEditor',
  EaseCurve: 'curve1d.EaseCurve',
  ElasticCurve: 'curve1d.ElasticCurve',
  EquationCurve: 'curve1d.EquationCurve',
  FloatArrayProperty: 'toolprop.FloatArrayProperty',
  GraphItToolMode: 'graphit.GraphItToolMode',
  GuassianCurve: 'curve1d.GuassianCurve',
  ImageEditor: 'image.ImageEditor',
  ImageNode: 'shader.ImageNode',
  IntProperty: 'toolprop.IntProperty',
  ListProperty: 'toolprop.ListProperty',
  Mat4Property: 'toolprop.Mat4Property',
  MeshEditor: 'mesh_edit.MeshEditor',
  MeshToolBase: 'mesh_edit.MeshToolBase',
  MixNode: 'shader.MixNode',
  MorphEditor: 'morph.MorphEditor',
  MorphToolMode: 'morph.MorphToolMode',
  MultiGridData: 'mesh.MultiGridData',
  MultiGridSettings: 'mesh.MultiGridSettings',
  NodeGroup: 'graph.NodeGroup',
  NodeGroupInputs: 'graph.NodeGroupInputs',
  NodeGroupInst: 'graph.NodeGroupInst',
  NodeGroupOutputs: 'graph.NodeGroupOutputs',
  NodeViewer: 'node.NodeViewer',
  NullObject: 'nullobject.NullObject',
  NumProperty: 'toolprop.NumProperty',
  ObjectEditor: 'view3d.ObjectEditor',
  PFace: 'subsurf_tester.PFace',
  PVert: 'subsurf_tester.PVert',
  PanToolMode: 'view3d.PanToolMode',
  ParamToolMode: 'parameterizer.ParamToolMode',
  ParamVert: 'mesh.ParamVert',
  ParamVertSettings: 'mesh.ParamVertSettings',
  PatchTester: 'subsurf_tester.PatchTester',
  QuatProperty: 'toolprop.QuatProperty',
  RandCurve: 'curve1d.RandCurve',
  SimpleCurveBase: 'curve1d.SimpleCurveBase',
  SolverElem: 'mesh.SolverElem',
  SolverSettings: 'mesh.SolverSettings',
  Strand: 'hair.Strand',
  StrandSet: 'hair.StrandSet',
  StrandTool: 'strand.StrandTool',
  StringSetProperty: 'toolprop.StringSetProperty',
  SubsurfTangentTester: 'subsurf_tester.SubsurfTangentTester',
  TetMeshTool: 'tetmesh.TetMeshTool',
  Vec2Property: 'toolprop.Vec2Property',
  Vec3Property: 'toolprop.Vec3Property',
  Vec4Property: 'toolprop.Vec4Property',
  _NumberPropertyBase: 'toolprop._NumberPropertyBase',
}

// Built once: matches any old name as a standalone identifier token. The
// leading `(?<![.\w])` guard means a module-qualified NEW name (e.g.
// `hair.Strand`) does NOT match the bare key (`Strand`), so files written after
// the migration skip parsing entirely. Used only as a cheap pre-check —
// correctness does not depend on it (the parse loop renames by exact equality).
const LEGACY_NAME_RE = new RegExp(
  '(?<![.\\w])(?:' +
    Object.keys(LEGACY_STRUCT_NAME_MAP)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|') +
    ')(?![\\w])'
)

const StructEnum = nstructjs.parser.StructEnum as Record<string, number>

/**
 * Recursively rewrite any struct-name references buried in a field's
 * TypeDescriptor tree. Returns true if anything was renamed.
 */
function renameTypeRefs(type: any): boolean {
  if (!type || typeof type !== 'object') {
    return false
  }

  switch (type.type) {
    case StructEnum.STRUCT:
    case StructEnum.TSTRUCT: {
      // .data holds the referenced struct name
      const repl = LEGACY_STRUCT_NAME_MAP[type.data]
      if (repl !== undefined) {
        type.data = repl
        return true
      }
      return false
    }
    case StructEnum.ARRAY:
    case StructEnum.ITER:
    case StructEnum.ITERKEYS:
    case StructEnum.STATIC_ARRAY:
      // container types nest the element descriptor under .data.type
      return renameTypeRefs(type.data && type.data.type)
    case StructEnum.OPTIONAL:
      // optional(T) nests the descriptor directly under .data
      return renameTypeRefs(type.data)
    default:
      return false
  }
}

/**
 * Rewrite the embedded schema text of a legacy file so old struct names map to
 * their new module-qualified names. Idempotent and a no-op for files that
 * contain no legacy names (returns the input unchanged). Never throws: on any
 * parse/emit failure it logs and returns the original text so loading can
 * proceed (the loader's existing missing-struct handling then applies).
 */
export function remapLegacyStructSchema(structsText: string): string {
  if (!structsText || !LEGACY_NAME_RE.test(structsText)) {
    return structsText
  }

  try {
    const parser = nstructjs.parser.struct_parse
    const STRUCT = nstructjs.STRUCT as unknown as {
      fmt_struct(stt: unknown): string
    }

    parser.input(structsText)

    let out = ''
    let changed = false

    while (!parser.at_end()) {
      const stt = parser.parse(undefined, false) as {
        name: string
        fields: {type: unknown}[]
      }

      const repl = LEGACY_STRUCT_NAME_MAP[stt.name]
      if (repl !== undefined) {
        stt.name = repl
        changed = true
      }

      for (const f of stt.fields) {
        if (renameTypeRefs(f.type)) {
          changed = true
        }
      }

      out += STRUCT.fmt_struct(stt) + '\n'

      // Consume trailing whitespace between structs (and after the final one) so
      // `at_end()` becomes true at EOF — this mirrors STRUCT.parse_structs, which
      // tolerates the trailing newline that write_scripts always emits.
      let tok = parser.peek() as {value?: string} | undefined
      while (tok && (tok.value === '\n' || tok.value === '\r' || tok.value === '\t' || tok.value === ' ')) {
        tok = parser.peek() as {value?: string} | undefined
      }
    }

    // If nothing actually changed, keep the original text verbatim rather than
    // risk any cosmetic round-trip difference from the re-emit.
    return changed ? out : structsText
  } catch (error) {
    console.warn('legacy struct-schema migration failed; loading file as-is', error)
    return structsText
  }
}

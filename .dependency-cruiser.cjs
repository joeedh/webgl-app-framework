/**
 * Layer boundary rules for the toolmodes/addons refactor.
 *
 * Caught here (in addition to ESLint) because dependency-cruiser walks the actual
 * module graph including .js files and dynamic imports, so it catches cases the lint
 * rules might miss.
 *
 * Severity is `warn` while the refactor is in flight (the codebase has known
 * violations the migration will sever step-by-step). Convert to `error` in the
 * cleanup pass (plan §6 step 12).
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name    : 'core-no-mesh',
      severity: 'warn',
      comment :
        'scripts/core/ must not depend on scripts/mesh/. Use the data_kinds / default_file / ' +
        'file_migrations registries instead (plan §3).',
      from: {path: '^scripts/core/'},
      to  : {path: '^scripts/mesh/'},
    },
    {
      name    : 'core-no-subsurf',
      severity: 'warn',
      comment : 'scripts/core/ must not depend on scripts/subsurf/. Subsurf is moving into an addon.',
      from    : {path: '^scripts/core/'},
      to      : {path: '^scripts/subsurf/'},
    },
    {
      name    : 'core-no-view3d-tools',
      severity: 'warn',
      comment :
        'scripts/core/ must not depend on individual view3d toolmodes. Only the ToolMode base ' +
        'in scripts/editors/view3d/view3d_toolmode is allowed.',
      from: {path: '^scripts/core/'},
      to  : {path: '^scripts/editors/view3d/tools/'},
    },
    {
      name    : 'util-no-mesh',
      severity: 'warn',
      comment : 'scripts/util/ must stay mesh-agnostic. Extract needed interfaces into util/spatial.ts.',
      from    : {path: '^scripts/util/'},
      to      : {path: '^scripts/mesh/'},
    },
    {
      name    : 'core-no-addons',
      severity: 'warn',
      comment :
        'Core must not import addon source. Addons depend on core, never the reverse. ' +
        'Editors and editors/view3d/tools/* are intentionally excluded — they are ' +
        'tool-like layers that consume the mesh addon API and themselves move into ' +
        'addons in a follow-up; tracked separately under core-no-view3d-tools.',
      from: {path: '^scripts/(core|util|scene|sceneobject)/'},
      to  : {path: '^addons/'},
    },
    {
      name    : 'no-circular',
      severity: 'warn',
      comment : 'Circular dependencies make refactoring impossible. Track and reduce over time.',
      from    : {},
      to      : {circular: true},
    },
  ],

  options: {
    doNotFollow: {
      path: ['node_modules', 'sculptcore', 'build', 'dist'],
    },
    exclude: {
      path: [
        'node_modules',
        'scripts/path.ux',
        'scripts/mathl',
        'scripts/renderengine',
        'scripts/shadernodes',
        'sculptcore',
        'scripts/extern',
        'build',
        'dist',
        'esdocs',
        'docs',
        '\\.test\\.(t|j)sx?$',
      ],
    },
    tsConfig: {fileName: 'tsconfig.json'},

    enhancedResolveOptions: {
      exportsFields    : ['exports'],
      conditionNames   : ['import', 'require', 'node', 'default'],
      mainFields       : ['module', 'main', 'types', 'typings'],
      extensions       : ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },

    reporterOptions: {
      text: {highlightFocused: true},
    },
  },
}

import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import {defineConfig, globalIgnores} from 'eslint/config'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

export default defineConfig([
  globalIgnores([
    //
    '**/node_modules/**',
    './scripts/path.ux/**',
    './scripts/mathl/**',
    './types/**',
    './esdocs/**',
    './addons/**', // might want to remove this line later
  ]),
  {
    files          : ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins        : {js},
    extends        : ['js/recommended'],
    languageOptions: {globals: globals.browser},
  },
  tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService : true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Layer boundaries: prevent core/util from reaching into mesh, prevent cross-addon
  // direct imports. Warn-level today (codebase has legacy violations);
  // converted to error in the cleanup step (§6 step 12) once the mesh body has
  // moved into addons/builtin/mesh/.
  {
    files: ['scripts/core/**/*.{ts,tsx,js,mjs,cjs}'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {group: ['*/mesh/*', '../mesh/*', '**/mesh/*'], message: 'core/ must not import scripts/mesh/* — use the data_kinds / default_file / file_migrations registries (see plan §3).'},
            {group: ['../editors/view3d/tools/*'], message: 'core/ must not import view3d toolmode files — only the ToolMode base in view3d_toolmode is allowed.'},
            {group: ['../../addons/**'], allowTypeImports: true, message: 'core/ must not import addon source — addons depend on core, not the other way around. Type-only imports are allowed (they erase at compile time).'},
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/util/**/*.{ts,tsx,js,mjs,cjs}'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {group: ['*/mesh/*', '../mesh/*'], message: 'util/ must stay mesh-agnostic — extract any needed interfaces into util/spatial.ts (see plan §3).'},
          ],
        },
      ],
    },
  },
  {
    files: ['addons/builtin/*/src/**/*.{ts,tsx,js,mjs,cjs}'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {group: ['../../../../addons/builtin/*'], message: 'Builtin addons must not reach into each other directly — declare a manifest dependency and use api.deps or @addon/<id>/api (see plan §2.5).'},
          ],
        },
      ],
    },
  },
  {
    rules: {
      'no-unused-vars'                                            : 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'none',
        },
      ],
      'sort-imports'                                              : 'off',
      'no-constant-condition'                                     : 'off',
      'no-unassigned-vars'                                        : 'error',
      'no-unreachable-loop'                                       : 'off',
      'no-unreachable'                                            : 'error',
      'no-unsafe-negation'                                        : 'error',
      'no-useless-assignment'                                     : 'error',
      '@typescript-eslint/array-type'                             : 'error',
      '@typescript-eslint/no-for-in-array'                        : 'error',
      '@typescript-eslint/no-mixed-enums'                         : 'error',
      '@typescript-eslint/no-non-null-asserted-nullish-coalescing': 'error',

      // Note: you must disable the base shadow rule as it can report incorrect errors
      'no-shadow'                   : 'off',
      '@typescript-eslint/no-shadow': 'error',

      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',

      // Note: you must disable the base rule as it can report incorrect errors
      'no-unused-private-class-members'                   : 'off',
      '@typescript-eslint/no-unused-private-class-members': 'error',
      '@typescript-eslint/no-useless-default-assignment'  : 'error',
      '@typescript-eslint/prefer-includes'                : 'error',
      '@typescript-eslint/prefer-optional-chain'          : 'error',
      '@typescript-eslint/related-getter-setter-pairs'    : 'error',
      '@typescript-eslint/no-empty-object-type'           : 'off',
      'one-var'                                           : ['error', 'never'],
    },
  },
  eslintConfigPrettier,
  eslintPluginPrettierRecommended,
  {
    rules: {
      'prettier/prettier': [
        'error',
        {
          usePrettierrc: true,
        },
      ],
    },
  },
])

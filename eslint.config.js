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
        projectService: true,
      },
    },
  },
  {
    rules: {
      'no-unused-vars': [
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

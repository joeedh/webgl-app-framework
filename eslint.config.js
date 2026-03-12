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
    rules: {
      'no-unused-vars'       : 'error',
      'sort-imports'         : 'off',
      'no-constant-condition': 'off',
      'no-unassigned-vars'   : 'error',
      'no-unreachable-loop'  : 'error',
      'no-unreachable'       : 'error',
      'no-unsafe-negation'   : 'error',
      'no-useless-assignment': 'error',
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

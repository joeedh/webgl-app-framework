/**
 * Jest config for the webgl-app-framework test workspace.
 *
 * - jsdom environment because most framework code touches window / document / _appstate
 * - @swc/jest transforms .ts and .js (faster than ts-jest, no separate tsconfig wiring)
 * - moduleNameMapper rewrites the framework's .js suffix to allow Jest's resolver to
 *   find the actual .ts source (the build is bundled by esbuild in production)
 *
 * Tests live under tests/{unit,integration,build}/**.test.ts. tests/lib/ holds shared
 * helpers (scene-fixture etc.) and is excluded from collection.
 */

import type {Config} from 'jest'

const config: Config = {
  clearMocks      : true,
  coverageProvider: 'v8',
  rootDir         : '.',
  testEnvironment : 'jsdom',

  moduleFileExtensions: ['ts', 'tsx', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'],

  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],

  // Don't try to load helpers as tests
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/lib/', '<rootDir>/fixtures/'],

  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax    : 'typescript',
            tsx       : true,
            decorators : true,
          },
          target     : 'es2022',
          transform  : {
            decoratorMetadata: true,
          },
        },
        module: {
          type: 'es6',
        },
      },
    ],
  },

  // Framework imports use a .js suffix even on .ts sources (e.g.
  // import {...} from '../path.ux/scripts/pathux.js'). Strip the .js so Jest's
  // resolver finds the .ts.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Run on ESM
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
}

export default config

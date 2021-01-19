import commonjs from '@rollup/plugin-commonjs';
import {terser} from 'rollup-plugin-terser';

export default {
  input: 'core/mathl.js',
  output: {
    file: 'bundle.js',
    format: 'iife',
    name : "JsGLSL"
  },
  plugins: [commonjs(), terser()]
};

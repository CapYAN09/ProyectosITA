import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'app.ts',
  output: {
    file: 'dist/app.js',
    format: 'cjs',
    sourcemap: false
  },
  plugins: [
    resolve({
      preferBuiltins: true
    }),
    commonjs(),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      exclude: ['node_modules/**']
    })
  ],
  external: [
    '@builderbot/bot',
    '@builderbot/provider-baileys',
    'mysql2/promise',
    'express',
    'axios',
    'path',
    'fs',
    'child_process'
  ]
};
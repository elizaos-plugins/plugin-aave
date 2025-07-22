import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  external: [
    '@elizaos/core',
    'ethers',
    'viem',
    '@aave/contract-helpers',
    '@aave/math-utils',
    '@aave/protocol-js',
    'zod',
    'bignumber.js'
  ],
  treeshake: true,
  splitting: false,
  bundle: true
});
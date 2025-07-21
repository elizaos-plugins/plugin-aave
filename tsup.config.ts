import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    outDir: 'dist',
    sourcemap: true,
    clean: true,
    format: ['esm'],
    external: [
        'dotenv',
        'fs',
        'path',
        '@elizaos/core',
        '@aave/contract-helpers',
        '@aave/math-utils',
        'ethers',
        'bignumber.js'
    ],
    dts: true,
});
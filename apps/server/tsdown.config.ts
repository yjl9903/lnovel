import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    logging: 'src/logging.ts'
  },
  format: ['esm'],
  dts: {
    // Resolve workspace types from package exports only during declaration emit.
    tsconfig: './tsconfig.dts.json'
  },
  clean: true,
  outDir: 'dist'
});

import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    logging: 'src/logging.ts'
  },
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist'
});

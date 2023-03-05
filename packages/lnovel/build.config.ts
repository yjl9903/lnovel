import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: ['src/cli', 'src/index'],
  declaration: true,
  clean: true
});

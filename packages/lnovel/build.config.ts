import { defineBuildConfig } from 'unbuild';

import { UnbuildPreset } from 'epubook';

export default defineBuildConfig({
  entries: ['src/cli', 'src/index'],
  declaration: true,
  clean: true,
  preset: UnbuildPreset()
});

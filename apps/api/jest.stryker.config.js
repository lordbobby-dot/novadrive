// A narrowed Jest config for Stryker's mutation run — only the spec files that actually exercise
// the mutated files (see stryker.conf.json's `mutate` list). Running the full 446-test unit suite
// per mutant would make mutation testing prohibitively slow for no extra signal, since only these
// specs can ever kill a mutant in permission-resolver.service.ts/permission.entity.ts/
// org-role-resolver.service.ts.
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex:
    '(modules/sharing/domain/permission-resolver\\.service|modules/sharing/domain/permission\\.entity|modules/organizations/domain/org-role-resolver\\.service)\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
};

/** Unit tests: jest-expo mocks the native side, so these run on Linux with no simulator. */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/', '<rootDir>/dist/'],
  // pnpm keeps packages under node_modules/.pnpm/<name>/node_modules/<name>, so the regex sees the
  // inner name too: every ESM-only package must be listed. Workspace
  // packages (@repo/*) resolve to packages/*/src and are transformed like app code.
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|@clerk/.*|uniwind|standard-navigation|@repo/.*))',
  ],
}

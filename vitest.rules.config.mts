import { defineConfig } from 'vitest/config';

// Rules tests talk to the Firestore emulator; they are deliberately kept out of
// `test:unit` (vitest.config.mts) so unit tests need no emulator/Java.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});

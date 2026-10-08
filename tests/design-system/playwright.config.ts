import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, fullyParallel: false,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://localhost:3005', viewport: { width: 1440, height: 1000 }, contextOptions: { reducedMotion: 'reduce' }, screenshot: 'only-on-failure' },
  reporter: 'list', outputDir: '../../test-results/design-system',
});

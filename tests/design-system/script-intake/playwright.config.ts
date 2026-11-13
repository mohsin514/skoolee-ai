import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'intake.spec.ts', workers: 1, use: { viewport: { width: 1280, height: 900 }, contextOptions: { reducedMotion: 'reduce' }, screenshot: 'only-on-failure' }, reporter: 'list', outputDir: '../../../test-results/design-system/script-intake' });

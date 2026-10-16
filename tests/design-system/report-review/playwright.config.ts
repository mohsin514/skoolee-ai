import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'review.spec.ts',workers:1,timeout:30000,use:{viewport:{width:320,height:720},contextOptions:{reducedMotion:'reduce'},trace:'retain-on-failure'},reporter:'list',outputDir:'../../../test-results/design-system/report-review'});

import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'*.spec.ts',workers:1,use:{viewport:{width:1440,height:1000},screenshot:'only-on-failure'},reporter:'list',outputDir:'../../../test-results/design-system/component-adoption'});

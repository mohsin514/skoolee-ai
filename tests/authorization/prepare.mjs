// Run before starting the local production server: Next inventories public files at boot.
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('public/generated/reports', {recursive:true});
await writeFile('public/generated/reports/sko207-synthetic.pdf', 'SYNTHETIC LEGACY REPORT');
await writeFile('public/sko207-control.txt', 'SYNTHETIC STATIC CONTROL');

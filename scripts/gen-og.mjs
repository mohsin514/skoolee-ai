import sharp from "sharp";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { resolve } = require("path");

const bgSvg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#8127CF"/>
      <stop offset="1" stop-color="#4F1487"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="980" cy="90" r="300" fill="#9C48EA" opacity="0.35"/>
  <circle cx="180" cy="620" r="360" fill="#B073F0" opacity="0.22"/>
  <text x="480" y="300" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="800" fill="#FFFFFF">Skoolee AI</text>
  <text x="482" y="352" font-family="Arial,Helvetica,sans-serif" font-size="26" fill="#F0DCFF">AI school management software</text>
</svg>`;

const favicon = resolve(process.cwd(), "public/favicon.svg");

const bg = sharp(Buffer.from(bgSvg)).png();
const mark = sharp(favicon).resize(300, 300).png().toBuffer();

const markBuffer = await mark;
const out = await bg.composite([{ input: markBuffer, top: 165, left: 165 }]).png().toBuffer();
await sharp(out).toFile(resolve(process.cwd(), "public/og-image.png"));
console.log("wrote public/og-image.png");
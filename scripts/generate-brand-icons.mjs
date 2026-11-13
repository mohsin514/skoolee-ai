// Renders the full "Skoolee AI" wordmark (eyes + cap) into every app icon:
// web (Vercel), Capacitor Android/iOS. Desktop (Tauri) icons come from
// `npm run app:icons`, which reads public/icon-1024.png produced here.
// Masters: public/brand/skoolee-wordmark.svg (animated, outlined glyphs).
import sharp from "sharp";
import { readFileSync } from "node:fs";

const wordmark = readFileSync("public/brand/skoolee-wordmark.svg");
const [, vw, vh] = /viewBox="0 0 (\d+) (\d+)"/.exec(wordmark.toString());
const ratio = Number(vh) / Number(vw);

/** Square PNG: wordmark at `scale` of the width on a background shape. */
async function icon(size, out, { scale = 0.86, bg = "#FFFFFF", shape = "square", opaque = false } = {}) {
  const w = Math.round(size * scale);
  const mark = await sharp(wordmark, { density: 72 * Math.max(1, (w / Number(vw)) * 4) })
    .resize({ width: w, height: Math.round(w * ratio) })
    .png()
    .toBuffer();
  let base;
  if (!bg) base = sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  else if (shape === "square") base = sharp({ create: { width: size, height: size, channels: 4, background: bg } });
  else {
    const r = shape === "circle" ? size / 2 : size * 0.22;
    base = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${bg}"/></svg>`));
  }
  let img = base.composite([{ input: mark, gravity: "center" }]);
  if (opaque) img = sharp(await img.png().toBuffer()).flatten({ background: "#FFFFFF" });
  await img.png().toFile(out);
}

await icon(1024, "public/icon-1024.png");
await icon(180, "public/apple-icon.png", { opaque: true });

const res = "android/app/src/main/res";
for (const [d, s, fg] of [["mdpi", 48, 108], ["hdpi", 72, 162], ["xhdpi", 96, 216], ["xxhdpi", 144, 324], ["xxxhdpi", 192, 432]]) {
  await icon(s, `${res}/mipmap-${d}/ic_launcher.png`, { scale: 0.84, shape: "rounded" });
  await icon(s, `${res}/mipmap-${d}/ic_launcher_round.png`, { scale: 0.78, shape: "circle" });
  // Adaptive foreground: keep the mark inside the 66% safe zone.
  await icon(fg, `${res}/mipmap-${d}/ic_launcher_foreground.png`, { scale: 0.62, bg: null });
}

const ios = "ios/App/App/Assets.xcassets/AppIcon.appiconset";
const iosSizes = {
  "AppIcon-20x20@1x": 20, "AppIcon-20x20@2x": 40, "AppIcon-20x20@2x-1": 40, "AppIcon-20x20@3x": 60,
  "AppIcon-29x29@1x": 29, "AppIcon-29x29@2x": 58, "AppIcon-29x29@2x-1": 58, "AppIcon-29x29@3x": 87,
  "AppIcon-40x40@1x": 40, "AppIcon-40x40@2x": 80, "AppIcon-40x40@2x-1": 80, "AppIcon-40x40@3x": 120,
  "AppIcon-60x60@2x": 120, "AppIcon-60x60@3x": 180, "AppIcon-76x76@1x": 76, "AppIcon-76x76@2x": 152,
  "AppIcon-83.5x83.5@2x": 167, "AppIcon-512@2x": 1024,
};
// iOS rounds the corners itself and rejects alpha.
for (const [n, s] of Object.entries(iosSizes)) await icon(s, `${ios}/${n}.png`, { opaque: true });
console.log("brand icons written");

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";

// 원본 아이콘(정사각, 1024px 권장) 한 장으로 PWA·iPhone·브라우저 탭 아이콘을 만든다.
// 원본은 바탕이 가장자리까지 차 있고 그림이 가운데 60% 안에 있어야 maskable로도 쓸 수 있다.
const SOURCE = new URL("../assets/app-icon.png", import.meta.url);
const ICONS = new URL("../public/icons/", import.meta.url);
const PUBLIC = new URL("../public/", import.meta.url);
mkdirSync(ICONS, { recursive: true });

const src = await loadImage(SOURCE);

// rounded: 모서리 반경 비율(0이면 정사각)
function render(size, rounded = 0) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (rounded) {
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * rounded);
    ctx.clip();
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, size, size);
  return canvas.toBuffer("image/png");
}

const icons = [
  ["icon-192.png", 192, 0.22],
  ["icon-512.png", 512, 0.22],
  ["icon-maskable-512.png", 512, 0],
  ["apple-touch-icon.png", 180, 0],
  ["favicon-64.png", 64, 0.22],
];
for (const [name, size, rounded] of icons) {
  writeFileSync(new URL(name, ICONS), render(size, rounded));
  console.log("wrote", name);
}

// 링크를 보지 않고 사이트 최상위 경로에서 아이콘을 찾는 브라우저·기기를 위한 사본.
const touch = render(180, 0);
for (const name of ["apple-touch-icon.png", "apple-touch-icon-precomposed.png"]) {
  writeFileSync(new URL(name, PUBLIC), touch);
  console.log("wrote", name);
}
writeFileSync(new URL("favicon.ico", PUBLIC), ico([render(32, 0.22), render(48, 0.22)], [32, 48]));
console.log("wrote favicon.ico");

// PNG를 그대로 담은 ICO 파일.
function ico(pngs, sizes) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach((png, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(sizes[i], e);
    header.writeUInt8(sizes[i], e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs]);
}

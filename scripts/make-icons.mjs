import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const amber = [245, 158, 11, 255];
const black = [9, 9, 11, 255];
const icons = [
  ["public/icons/icon-192.png", 192, false],
  ["public/icons/icon-512.png", 512, false],
  ["public/icons/icon-maskable.png", 512, true]
];
const crcTable = makeCrcTable();

await mkdir("public/icons", { recursive: true });

for (const [path, size, maskable] of icons) {
  await writeFile(path, await renderIcon(size, maskable));
  console.log(`wrote ${path}`);
}

async function renderIcon(size, maskable) {
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const svg = makeSvg(size, maskable);
    return new Resvg(svg, {
      fitTo: {
        mode: "width",
        value: size
      }
    }).render().asPng();
  } catch {
    return makePng(size, maskable);
  }
}

function makeSvg(size, maskable) {
  const inset = maskable ? Math.round(size * 0.12) : 0;
  const fontSize = Math.round(size * 0.68);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#09090b"/>
  <text
    x="${size / 2}"
    y="${size / 2 + inset * 0.16}"
    fill="#f59e0b"
    font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    text-anchor="middle"
    dominant-baseline="central">r</text>
</svg>`;
}

function makePng(size, maskable) {
  const pixels = new Uint8Array(size * size * 4);
  const matrix = [
    "11110",
    "11011",
    "11000",
    "11000",
    "11000",
    "11000",
    "11000"
  ];
  const block = Math.floor(size / (maskable ? 10 : 8));
  const width = matrix[0].length * block;
  const height = matrix.length * block;
  const startX = Math.floor((size - width) / 2);
  const startY = Math.floor((size - height) / 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      setPixel(pixels, size, x, y, black);
    }
  }

  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row].length; col++) {
      if (matrix[row][col] !== "1") {
        continue;
      }

      fillRect(
        pixels,
        size,
        startX + col * block,
        startY + row * block,
        block,
        block,
        amber
      );
    }
  }

  return encodePng(size, size, pixels);
}

function fillRect(pixels, size, x, y, width, height, color) {
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      setPixel(pixels, size, col, row, color);
    }
  }
}

function setPixel(pixels, size, x, y, color) {
  const offset = (y * size + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", concatUint8(
      u32(width),
      u32(height),
      Uint8Array.from([8, 6, 0, 0, 0])
    )),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array())
  ]);
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type);
  const payload = Buffer.from(data);

  return Buffer.concat([
    Buffer.from(u32(payload.length)),
    typeBytes,
    payload,
    Buffer.from(u32(crc32(Buffer.concat([typeBytes, payload]))))
  ]);
}

function concatUint8(...arrays) {
  const output = new Uint8Array(arrays.reduce((total, array) => total + array.length, 0));
  let offset = 0;

  for (const array of arrays) {
    output.set(array, offset);
    offset += array.length;
  }

  return output;
}

function u32(value) {
  return Uint8Array.from([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  ]);
}

function crc32(data) {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});
}

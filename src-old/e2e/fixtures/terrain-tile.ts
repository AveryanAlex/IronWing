import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const DEFAULT_TILE_SIZE = 256;

let crcTable: Uint32Array | null = null;

export const DEFAULT_TERRARIUM_ELEVATION_M = 460;
export const TERRARIUM_TILE_CONTENT_TYPE = "image/png";

export function encodeTerrariumColor(elevationM: number): {
  red: number;
  green: number;
  blue: number;
} {
  const shifted = elevationM + 32768;
  const red = clampByte(Math.floor(shifted / 256));
  const green = clampByte(Math.floor(shifted - red * 256));
  const blue = clampByte(Math.round((shifted - Math.floor(shifted)) * 256));

  return { red, green, blue };
}

export function createSolidTerrariumTilePng(
  elevationM: number,
  options?: {
    size?: number;
    alpha?: number;
  },
): Buffer {
  const size = options?.size ?? DEFAULT_TILE_SIZE;
  const alpha = clampByte(options?.alpha ?? 255);
  const { red, green, blue } = encodeTerrariumColor(elevationM);
  const rowStride = size * 4 + 1;
  const raw = Buffer.alloc(rowStride * size);

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * rowStride;
    raw[rowStart] = 0;

    for (let x = 0; x < size; x += 1) {
      const pixelStart = rowStart + 1 + x * 4;
      raw[pixelStart] = red;
      raw[pixelStart + 1] = green;
      raw[pixelStart + 2] = blue;
      raw[pixelStart + 3] = alpha;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export const DEFAULT_TERRARIUM_TILE_PNG = createSolidTerrariumTilePng(DEFAULT_TERRARIUM_ELEVATION_M);

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, "ascii");
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function crc32(buffer: Buffer): number {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]!;
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getCrcTable(): Uint32Array {
  if (crcTable) {
    return crcTable;
  }

  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[index] = value >>> 0;
  }

  return crcTable;
}

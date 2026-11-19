// Shared by art.ts and avatars.ts: paths into rs-sdk, the DOM shim the webclient needs, the item and
// player renderer, and a PNG encoder (Bun has no canvas). Pixel value 0 is the renderer's transparent key.
import fs from 'fs';
import zlib from 'zlib';

// Defaults are the rs-sdk:71d949d image; set RS_SDK=~/src/rs-sdk to use a checkout with a built pack.
const ROOT = process.env.RS_SDK ?? '/opt/server';
export const WC = `${ROOT}/webclient/src`;
export const PACK = `${ROOT}/engine/data/pack`;

await import(`${WC}/lite/dom-shim.ts`); // before any webclient module: they touch `document` at load
// Pix3D.setBrightness jitters the palette by Math.random() * 0.03 - 0.015; pin it so renders are reproducible.
Math.random = () => 0.5;

export type Appearance = { gender: number; colors: number[]; slots: number[] };

/** The webclient's standalone ItemViewer (the engine's /sprite/item and /sprite/player endpoints use it). */
export async function loadViewer() {
    const { ItemViewer } = await import(`${WC}/viewer/ItemViewer.ts`);
    const v = new ItemViewer();
    v.initFromData(
        {
            config: fs.readFileSync(`${PACK}/client/config`),
            textures: fs.readFileSync(`${PACK}/client/textures`),
            versionlist: fs.readFileSync(`${PACK}/client/versionlist`),
            ondemand: fs.readFileSync(`${PACK}/ondemand.zip`)
        },
        { lazyModels: true }
    );
    return v;
}

/** player_info APPEARANCE block (world feed `ap`, base64). Mirrors rs-world src/live/PlayerAppearance.ts. */
export function decodeAppearance(b64: string): Appearance & { name: string } {
    const d = Buffer.from(b64, 'base64');
    let p = 0;
    const gender = d[p++];
    p++; // head icons
    const slots = new Array<number>(12).fill(0);
    for (let i = 0; i < 12; i++) {
        const msb = d[p++];
        if (msb === 0) continue;
        slots[i] = (msb << 8) + d[p++];
        if (i === 0 && slots[0] === 0xffff) throw new Error('transmogrified player');
    }
    const colors = [0, 1, 2, 3, 4].map(() => d[p++]);
    p += 14; // seven animation ids
    let v = 0n;
    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(d[p++]);
    let name = '';
    for (; v > 0n; v /= 37n) name = '_abcdefghijklmnopqrstuvwxyz0123456789'[Number(v % 37n)] + name;
    return { gender, colors, slots, name };
}

/** A dialogue chat head, drawn the way Client.ts draws a TYPE_MODEL component (npcchat1.if: zoom 796, xan 40, yan 1882). */
export async function renderChatHead(model: any, size = 160): Promise<Int32Array | null> {
    if (!model) return null;
    const { default: Model } = await import(`${WC}/dash3d/Model.ts`);
    const { default: Pix3D } = await import(`${WC}/dash3d/Pix3D.ts`);
    const { default: Pix2D } = await import(`${WC}/graphics/Pix2D.ts`);
    const tmp = Model.copyForAnim(model, true, true, false);
    tmp.calculateNormals(64, 768, -50, -10, -50, true); // IfType.getTempModel's lighting
    const px = new Int32Array(size * size);
    Pix3D.lowDetail = false;
    Pix2D.setPixels(px, size, size);
    Pix3D.setRenderClipping();
    Pix3D.originY = (size * 11) >> 4; // a little low: hats rise above the dialogue's 32px box
    const zoom = 796, xan = 40, yan = 1882;
    tmp.objRender(0, yan, 0, xan, 0, (Pix3D.sinTable[xan] * zoom) >> 16, (Pix3D.cosTable[xan] * zoom) >> 16);
    return px;
}

export async function playerHeadModel(app: Appearance) {
    const { default: ClientPlayer } = await import(`${WC}/dash3d/ClientPlayer.ts`);
    const pl = new ClientPlayer();
    pl.gender = app.gender & 1;
    for (let i = 0; i < 12; i++) pl.appearance[i] = app.slots[i] ?? 0;
    for (let i = 0; i < 5; i++) pl.colour[i] = app.colors[i] ?? 0;
    pl.ready = true;
    return pl.getHeadModel();
}

const CRC = new Int32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC[i] = c;
}
function chunk(type: string, data: Uint8Array): Buffer {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    out.set(data, 8);
    let c = -1;
    for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 0xff] ^ (c >>> 8);
    out.writeUInt32BE((c ^ -1) >>> 0, 8 + data.length);
    return out;
}

/**
 * Encode 0xRRGGBB pixels as PNG. `alpha`: pixel 0 becomes transparent (RGBA); otherwise RGB, opaque.
 * Each row takes whichever of PNG filters 0-4 gives the smallest sum of bytes, which keeps the map small.
 */
export function encodePng(px: Int32Array, w: number, h: number, alpha = true): Buffer {
    const bpp = alpha ? 4 : 3, stride = w * bpp;
    const raw = new Uint8Array(stride * h);
    for (let i = 0; i < w * h; i++) {
        const p = px[i], o = i * bpp;
        if (alpha && p === 0) continue;
        raw[o] = (p >> 16) & 0xff;
        raw[o + 1] = (p >> 8) & 0xff;
        raw[o + 2] = p & 0xff;
        if (alpha) raw[o + 3] = 0xff;
    }
    const out = new Uint8Array((stride + 1) * h);
    const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
    for (let y = 0; y < h; y++) {
        const row = raw.subarray(y * stride, (y + 1) * stride);
        const up = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? row[i - bpp] : 0, b = up[i], c = i >= bpp ? up[i - bpp] : 0;
            const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
            cand[0][i] = row[i];
            cand[1][i] = row[i] - a;
            cand[2][i] = row[i] - b;
            cand[3][i] = row[i] - ((a + b) >> 1);
            cand[4][i] = row[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        let best = 0, bestSum = Infinity;
        for (let f = 0; f < 5; f++) {
            let s = 0;
            for (let i = 0; i < stride; i++) s += cand[f][i] < 128 ? cand[f][i] : 256 - cand[f][i];
            if (s < bestSum) { bestSum = s; best = f; }
        }
        out[y * (stride + 1)] = best;
        out.set(cand[best], y * (stride + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = alpha ? 6 : 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', new Uint8Array(0))]);
}

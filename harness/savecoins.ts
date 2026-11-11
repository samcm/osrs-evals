// bun savecoins.ts a.sav b.sav ...  ->  {"a": {"coins": n}, ...}  (inventory + bank)
const COINS = 995, INV = 93, BANK = 95;

function read(buf: Uint8Array) {
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let p = 0;
    const g1 = () => v.getUint8(p++);
    const g2 = () => ((p += 2), v.getUint16(p - 2));
    const g4 = () => ((p += 4), v.getInt32(p - 4));
    const gvar = () => { let b = g1(), r = 0; while (b & 0x80) { r = (r | (b & 0x7f)) << 7; b = g1(); } return r | b; };
    if (g2() !== 0x2004) throw new Error('not a save');
    const version = g2();
    p += 5 + 7 + 5 + 1 + 2 + (version >= 2 ? 4 : 2) + 21 * 5; // position, look, run energy, playtime, stats
    for (let n = g2(); n > 0; n--) version >= 7 ? (g2(), gvar()) : g4(); // varps
    let coins = 0;
    for (let n = g1(); n > 0; n--) {
        const type = g2(), size = g2();
        for (let s = 0; s < size; s++) {
            const id = g2() - 1;
            if (id < 0) continue;
            let count = g1();
            if (count === 255) count = g4();
            if (id === COINS && (type === INV || type === BANK)) coins += count;
        }
    }
    return { coins };
}

const out: Record<string, { coins: number }> = {};
for (const f of process.argv.slice(2)) out[f.split('/').pop()!.replace('.sav', '')] = read(new Uint8Array(await Bun.file(f).arrayBuffer()));
console.log(JSON.stringify(out));

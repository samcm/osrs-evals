// Read accounts from the server's own save files (the format of rs-sdk's PlayerLoading.ts).
//   bun saves.ts a.sav b.sav ...  ->  {"a": {...}, "b": {...}}
// Each account: position, skills (level and xp), non-zero varps (quest progress lives here),
// and item counts by id in the inventory, worn equipment and bank.
const SKILLS = ['attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving', 'stat18', 'stat19', 'runecraft'];
const CONTAINERS: Record<number, 'inv' | 'worn' | 'bank'> = { 93: 'inv', 94: 'worn', 95: 'bank' };

// rs-sdk's xp table (Player.ts: its faster curve uses 2^(level/10)), in tenths of xp as saved.
const LEVEL_XP: number[] = [];
for (let level = 1, acc = 0; level < 99; level++) {
    acc += Math.floor(level + Math.pow(2, level / 10) * 300);
    LEVEL_XP.push(Math.floor(acc / 4) * 10);
}
const levelOf = (tenths: number) => 1 + LEVEL_XP.filter((needed) => tenths >= needed).length;

export function readSave(buf: Uint8Array) {
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let p = 0;
    const g1 = () => v.getUint8(p++);
    const g2 = () => ((p += 2), v.getUint16(p - 2));
    const g4 = () => ((p += 4), v.getInt32(p - 4));
    const gvar = () => { let b = g1(), r = 0; while (b & 0x80) { r = (r | (b & 0x7f)) << 7; b = g1(); } return (r | b) >>> 0; };
    if (g2() !== 0x2004) throw new Error('not a save');
    const version = g2();
    const x = g2(), z = g2(), level = g1();
    p += 7 + 5 + 1 + 2; // look, colours, gender, run energy
    const playtime = version >= 2 ? g4() : g2();
    const skills: Record<string, { level: number; xp: number }> = {};
    for (const name of SKILLS) {
        const tenths = g4();
        g1(); // current (boosted or drained) level
        skills[name] = { level: levelOf(tenths), xp: tenths / 10 };
    }
    const varps: Record<number, number> = {};
    for (let n = g2(), i = 0; i < n; i++) {
        const [id, value] = version >= 7 ? [g2(), gvar()] : [i, g4()];
        if (value !== 0) varps[id] = value;
    }
    const items = { inv: {} as Record<number, number>, worn: {} as Record<number, number>, bank: {} as Record<number, number> };
    for (let n = g1(); n > 0; n--) {
        const type = g2(), size = g2();
        for (let s = 0; s < size; s++) {
            const id = g2() - 1;
            if (id < 0) continue;
            let count = g1();
            if (count === 255) count = g4();
            const into = CONTAINERS[type];
            if (into) items[into][id] = (items[into][id] ?? 0) + count;
        }
    }
    return { x, z, level, playtime, skills, varps, ...items };
}

if (import.meta.main) {
    const out: Record<string, ReturnType<typeof readSave>> = {};
    for (const f of process.argv.slice(2)) out[f.split('/').pop()!.replace('.sav', '')] = readSave(new Uint8Array(await Bun.file(f).arrayBuffer()));
    console.log(JSON.stringify(out));
}

// Game art for the site, from the rs-sdk cache. Run by build.sh inside rs-sdk:71d949d with the repo's
// site/ mounted at /site (or with RS_SDK=<rs-sdk checkout>/server and SITE=site, its pack built):
//   bun art.ts [items]  (items: only the item sprites and game/items.json)
//   items/<id>.png      every item's inventory sprite (ItemViewer.renderItemIcon; outline and shadow
//                       as in game), a note drawn as the game draws it, and the stack sprites
//   game/items.json     every item: name, store value, the item a note stands for, and which sprite
//                       a stack of it shows by count (coins: a pile)
//   quests/<id>.png     each quest's completion-scroll item, from site/game/quests.json
//   skills/<name>.png   stats-tab icons (media: staticons, staticons2) + site/game/skills.json
//   ui/<name>.png       side-panel tab icons (media: sideicons) and the stone panel (media: invback)
//   brands/program.png  the scripted baseline's mark (an item sprite)
//   map/world.png, world@2x.png, map.json  the RS2 world map (mapview, worldmap.jag) over the free-to-play surface
import fs from 'fs';
import { PACK, WC, encodePng, loadViewer } from './lib.ts';

const SITE = process.env.SITE ?? '/site';
const OUT = `${SITE}/public/assets`;
for (const d of ['items', 'quests', 'skills', 'ui', 'brands', 'map']) fs.mkdirSync(`${OUT}/${d}`, { recursive: true });

// ---- items ------------------------------------------------------------------------------------
// The site's sprites: coins, plus a few for ideas (Demon Slayer, Dragon Slayer, woodcutting,
// combat). `id-count` renders a stack (995-10000 = a big pile of coins).
const ITEMS = ['303', '590', '995', '995-10000', '1511', '1925', '1929', '1931', '1947',
    '1351', '1277', '1540', '2402', '1735', '1737'];
const PROGRAM = 21; // Black cog (Clock Tower): the scripted baseline, clockwork rather than a mind

const v = await loadViewer();
const icon = (id: number, count = 1) => {
    const s = v.renderItemIcon(id, count);
    if (!s) throw new Error(`no sprite for item ${id}`);
    return encodePng(s.data, s.wi, s.hi);
};
for (const key of ITEMS) {
    const [id, count] = key.split('-').map(Number);
    fs.writeFileSync(`${OUT}/items/${key}.png`, icon(id, count || 1));
}

// Every named item, for the runs' inventories and banks: its sprite at a count of one, and the item
// whose sprite a bigger stack shows ([at least this many, item]); the site picks the sprite by count.
const { default: ObjType } = await import(`${WC}/config/ObjType.ts`);
ObjType.memServer = true; // members' items by their own names
const table: Record<number, { name: string; cost: number; unnoted: number; stacks?: [number, number][] }> = {};
let drawn = 0;
for (let id = 0; id < ObjType.numDefinitions; id++) {
    const o = ObjType.list(id);
    if (!o.name) continue;
    const stacks: [number, number][] = [];
    for (let i = 0; o.countco && o.countobj && i < o.countco.length; i++) if (o.countco[i] > 0) stacks.push([o.countco[i], o.countobj[i]]);
    table[id] = { name: o.name, cost: o.cost, unnoted: o.certtemplate !== -1 ? o.certlink : id, ...(stacks.length ? { stacks } : {}) };
    const s = v.renderItemIcon(id, 1);
    if (!s) continue;
    fs.writeFileSync(`${OUT}/items/${id}.png`, encodePng(s.data, s.wi, s.hi));
    drawn++;
}
// A stack's own sprite items may have no name: draw them too
for (const obj of Object.values(table)) for (const [, id] of obj.stacks ?? []) {
    if (fs.existsSync(`${OUT}/items/${id}.png`)) continue;
    const s = v.renderItemIcon(id, 1);
    if (s) fs.writeFileSync(`${OUT}/items/${id}.png`, encodePng(s.data, s.wi, s.hi));
}
fs.writeFileSync(`${SITE}/game/items.json`, JSON.stringify(table) + '\n');
console.log(`item sprites: ${drawn} of ${Object.keys(table).length} named items`);
if (process.argv[2] === 'items') process.exit(0);
fs.writeFileSync(`${OUT}/items/${PROGRAM}.png`, icon(PROGRAM));
fs.writeFileSync(`${OUT}/brands/program.png`, icon(PROGRAM));
console.log(`items: ${ITEMS.length + 1}, program = ${PROGRAM} (${v.getItemName(PROGRAM)})`);

const quests = JSON.parse(fs.readFileSync(`${SITE}/game/quests.json`, 'utf8'));
// a coin reward is drawn as a pile, like the 995-10000 item sprite, not a single coin
for (const q of quests) fs.writeFileSync(`${OUT}/quests/${q.id}.png`, icon(q.reward_item.id, q.reward_item.id === 995 ? 10000 : 1));
console.log(`quest icons: ${quests.length}`);

// ---- interface sprites, as the client unpacks them from the media archive ------------------------
const { default: JagFile } = await import(`${WC}/io/JagFile.ts`);
const { default: Pix32 } = await import(`${WC}/graphics/Pix32.ts`);
const media = new JagFile(new Uint8Array(fs.readFileSync(`${PACK}/client/media`)));
const sprite = (name: string, i = 0) => {
    const p = Pix32.depack(media, name, i);
    p.trim(); // back to the full cell, offsets applied
    return encodePng(p.data, p.wi, p.hi);
};

// Save order (stat ids) from rs-sdk; stats 18 and 19 are unused in rev 289. Icon indexes from
// content/scripts/player/interfaces/stats.if (graphic=staticons,N; Runecraft is staticons2,0).
const SKILLS: [number, string, string, string, number][] = [
    [0, 'attack', 'Attack', 'staticons', 0], [1, 'defence', 'Defence', 'staticons', 2], [2, 'strength', 'Strength', 'staticons', 1],
    [3, 'hitpoints', 'Hitpoints', 'staticons', 6], [4, 'ranged', 'Ranged', 'staticons', 3], [5, 'prayer', 'Prayer', 'staticons', 4],
    [6, 'magic', 'Magic', 'staticons', 5], [7, 'cooking', 'Cooking', 'staticons', 15], [8, 'woodcutting', 'Woodcutting', 'staticons', 17],
    [9, 'fletching', 'Fletching', 'staticons', 11], [10, 'fishing', 'Fishing', 'staticons', 14], [11, 'firemaking', 'Firemaking', 'staticons', 16],
    [12, 'crafting', 'Crafting', 'staticons', 10], [13, 'smithing', 'Smithing', 'staticons', 13], [14, 'mining', 'Mining', 'staticons', 12],
    [15, 'herblore', 'Herblore', 'staticons', 8], [16, 'agility', 'Agility', 'staticons', 7], [17, 'thieving', 'Thieving', 'staticons', 9],
    [20, 'runecraft', 'Runecraft', 'staticons2', 0]
];
for (const [, id, , sheet, i] of SKILLS) fs.writeFileSync(`${OUT}/skills/${id}.png`, sprite(sheet, i));
fs.writeFileSync(`${SITE}/game/skills.json`, JSON.stringify(SKILLS.map(([stat, id, name]) => ({ id, name, stat, icon: `assets/skills/${id}.png` })), null, 1) + '\n');

// Side-panel tabs, in the client's sideicons order (tab ids in content/scripts/general/configs/tabs.constant).
const TABS = ['combat', 'stats', 'quests', 'inventory', 'equipment', 'prayer', 'magic', 'friends', 'ignore', 'logout', 'options', 'controls', 'music'];
TABS.forEach((name, i) => fs.writeFileSync(`${OUT}/ui/${name}.png`, sprite('sideicons', i)));
fs.writeFileSync(`${OUT}/ui/panel.png`, sprite('invback')); // the stone side panel behind every tab
console.log(`skills: ${SKILLS.length}, ui: ${TABS.length + 1}`);

// ---- world map ------------------------------------------------------------------------------------
// The mainland the runs reach, with a margin: Ardougne (west) to Al Kharid and the River Salve (east),
// Karamja (south) to the low Wilderness (north).
const X0 = 2432, X1 = 3391, Z0 = 3072, Z1 = 3711;
const { MapView } = await import(`${WC}/mapview/MapView.ts`);
MapView.prototype.run = async function () {}; // no event loop, no fetches; fields still initialise
const view = new MapView();
view.loadWorldmap = async () => new JagFile(new Uint8Array(fs.readFileSync(`${PACK}/mapview/worldmap.jag`)));
view.drawProgress = async () => {};
MapView.shouldDrawHistory = false;
MapView.shouldDrawPlayers = false;
await view.maininit();
const col = (x: number) => x - view.mapOriginX;
const row = (z: number) => view.mapOriginZ + view.mapHeight - view.remapZ(z);
for (const [k, name] of [[2, 'world'], [4, 'world@2x']] as const) {
    const w = (X1 - X0 + 1) * k, h = (Z1 - Z0 + 1) * k;
    const img = new Pix32(w, h);
    img.setPixels();
    view.renderWorldMap(col(X0), row(Z1 + 1), col(X1 + 1), row(Z0), 0, 0, w, h);
    const png = encodePng(img.data, w, h, false);
    fs.writeFileSync(`${OUT}/map/${name}.png`, png);
    console.log(`map/${name}.png ${w}x${h} ${(png.length / 1e6).toFixed(2)} MB`);
}
// px = (x - x0 + 0.5) * px_per_tile, py = (z1 - z + 0.5) * px_per_tile; world@2x.png is twice that.
fs.writeFileSync(`${OUT}/map/map.json`, JSON.stringify({ x0: X0, z1: Z1, px_per_tile: 2, width: (X1 - X0 + 1) * 2, height: (Z1 - Z0 + 1) * 2, level: 0 }, null, 1) + '\n');
process.exit(0);

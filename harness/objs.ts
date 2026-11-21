// Every obj (item) in the server's own config, as the engine loads it from the world image's cache:
//   bun /harness/objs.ts  ->  {"<id>": {"name", "cost", "unnoted"}, ...}
// cost is the item's store value; a noted item has its unnoted item's cost, and unnoted is the
// item it notes (the cert link). An item that is not a note is its own unnoted item.
import ObjType from '/opt/server/engine/src/cache/config/ObjType.ts';

ObjType.load('/opt/server/engine/data/pack');
const objs: Record<number, { name: string | null; cost: number; unnoted: number }> = {};
for (let id = 0; id < ObjType.count; id++) {
    const obj = ObjType.get(id);
    objs[id] = { name: obj.name, cost: obj.cost, unnoted: obj.certtemplate !== -1 ? obj.certlink : id };
}
console.log(JSON.stringify(objs));

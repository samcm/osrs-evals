#!/usr/bin/env python3
# Writes site/game/quests.json from rs-sdk's content scripts (stdlib only).
#   python3 site/game/quests.py [rs-sdk/server/content] > site/game/quests.json
#
# Sources, all under server/content:
#   scripts/general/scripts/quests.rs2  [proc,count_questpoints], the engine's own quest point recount:
#                                       one `if (<test on the quest's varp>) add ^x_questpoints` per quest
#   scripts/**/*.constant               values of ^x_complete and ^x_questpoints
#   scripts/**/*.varbit                 varbits (bit ranges of a varp)
#   scripts/player/interfaces/questlist.if  quest tab names; members quests sit below "MEMBERS QUESTS:"
#   pack/varp.pack, pack/obj.pack        numeric ids; scripts/**/*.obj for item names
#   send_quest_complete(questlist:x, <obj>, ...)  the item drawn on the quest's completion scroll
#
# Each quest's `complete` is a list of alternatives; the quest is complete when any one holds:
#   {"varp": id, "bits": [lo, hi] (optional, inclusive), "op": "eq" | "ge", "value": n}
# applied to the saved varp value (bits: (value >> lo) & ((1 << (hi - lo + 1)) - 1)).
import json, re, sys
from pathlib import Path

C = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "src/rs-sdk/server/content")
S = C / "scripts"
rs2 = (S / "general/scripts/quests.rs2").read_text()

const = {}
for f in S.rglob("*.constant"):
    const.update({k: int(v) for k, v in re.findall(r"^\^(\w+)\s*=\s*(-?\d+)", f.read_text(), re.M)})
varp_id = {n: int(i) for i, n in re.findall(r"^(\d+)=(\w+)$", (C / "pack/varp.pack").read_text(), re.M)}
obj_id = {n: int(i) for i, n in re.findall(r"^(\d+)=(\w+)$", (C / "pack/obj.pack").read_text(), re.M)}
varbits, obj_name, procs, scroll = {}, {}, {}, {}
for f in S.rglob("*.varbit"):
    for name, base, lo, hi in re.findall(r"^\[(\w+)\]\s*basevar=(\w+)\s*startbit=(\d+)\s*endbit=(\d+)", f.read_text(), re.M):
        varbits[name] = (base, int(lo), int(hi))
for f in S.rglob("*.obj"):
    cur = None
    for line in f.read_text().splitlines():
        if m := re.match(r"^\[(\w+)\]", line):
            cur = m.group(1)
        elif line.startswith("name=") and cur:
            obj_name.setdefault(cur, line[5:])
for f in S.rglob("*.rs2"):
    text = f.read_text()
    for name, ret in re.findall(r"^\[proc,(\w+)\]\(\)\(int\)\s*\n\s*return\((.*)\);", text, re.M):
        procs[name] = ret
    for comp, obj in re.findall(r"send_quest_complete2?\(questlist:(\w+), (\w+), \d+", text):
        scroll.setdefault(comp, obj)

names, ys, cur = {}, {}, None
for line in (S / "player/interfaces/questlist.if").read_text().splitlines():
    if m := re.match(r"^\[(\w+)\]", line):
        cur = m.group(1)
    elif line.startswith("text=") and cur:
        names[cur] = line[5:]
    elif line.startswith("y=") and cur:
        ys[cur] = int(line[2:])
members_from = ys["com_43"]  # the "MEMBERS QUESTS:" heading
comp_of = {}
for m in re.finditer(r"send_quest_progress_colour\(questlist:(\w+), [%~](\w+)", rs2):
    comp_of.setdefault(m.group(2), m.group(1))


def term(t: str) -> dict:
    """One comparison from count_questpoints -> {varp, bits?, op, value}."""
    t = re.sub(r"\^(\w+)", lambda m: str(const[m.group(1)]), t.strip())
    if m := re.fullmatch(r"testbit\(%(\w+), (\d+)\) = (\d+)", t.replace("^true", "1")):
        bit = int(m.group(2))
        return {"varp": varp_id[m.group(1)], "bits": [bit, bit], "op": "eq", "value": int(m.group(3))}
    m = re.fullmatch(r"([%~])(\w+)\s*(=|>=)\s*(\d+)", t)
    if not m:
        raise SystemExit(f"unparsed completion test: {t}")
    sigil, name, op, value = m.groups()
    out = {"op": "eq" if op == "=" else "ge", "value": int(value)}
    if sigil == "~":  # e.g. get_cog_progress: return(getbit_range(%cogquest, 0, 3))
        g = re.fullmatch(r"getbit_range\(%(\w+), (\d+), (\d+)\)", procs[name])
        return {"varp": varp_id[g.group(1)], "bits": [int(g.group(2)), int(g.group(3))], **out}
    if name in varbits:
        base, lo, hi = varbits[name]
        return {"varp": varp_id[base], "bits": [lo, hi], **out}
    return {"varp": varp_id[name], **out}


def slug(name: str) -> str:
    s = name.lower().replace("&", "and").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s[4:] if s.startswith("the_") else s


body = rs2.split("[proc,count_questpoints]", 1)[1].split("\nreturn", 1)[0]
quests = []
for cond, pts in re.findall(r"if \((.*?)\)\s*\{(?:\s*//.*)?\s*\$questpoints = add\(\$questpoints, \^(\w+)\)", body):
    cond = re.sub(r"\s*//.*", "", cond)
    vars_ = re.findall(r"[%~](\w+)", cond)
    comp = next((comp_of[v] for v in vars_ if v in comp_of), None) or next(c for c in names for v in vars_ if v.startswith(c))
    qid = slug(names[comp])
    complete = [term(t) for t in cond.split("|")]
    obj = scroll[comp]
    if obj == "null":  # custom scrolls draw a model (cat head, telescope); use the quest's own item
        obj = {"fluffs": "kittenobject", "itgronigen": "lens"}[comp]
    if obj.startswith("coins"):  # coins_25 etc. are stack models of the one Coins item
        obj = "coins"
    quests.append({
        "id": qid,
        "name": names[comp],
        "members": ys[comp] > members_from,
        "qp": const[pts],
        "varp": complete[0]["varp"],
        "complete": complete,
        "icon": f"assets/quests/{qid}.png",
        "reward_item": {"id": obj_id[obj], "name": obj_name.get(obj, obj)},
    })
assert len({q["id"] for q in quests}) == len(quests)
json.dump(quests, sys.stdout, indent=1)
sys.stdout.write("\n")
print(f"{len(quests)} quests, {sum(q['qp'] for q in quests)} qp", file=sys.stderr)

#!/usr/bin/env python3
"""Builds src/lib/preop/cbip-data.json from the CBIP CSV exports.

Usage: python3 scripts/build-cbip.py <folder with MP.csv, Sam.csv, Stof.csv, Hyr.csv, MPP.csv, Ggr_Link.csv>

One entry per set of active substances (Xarelto and its generics share
one): base names, the brands that contain them (with the CBIP page of
each), the CBIP chapter. No ATC code in the export: the app links entries
to its own ATC-coded list by name (see medications.ts)."""
import csv, glob, json, os, re, sys, unicodedata
from collections import Counter, defaultdict

src = sys.argv[1]
def find(name):
    hits = [p for p in glob.glob(os.path.join(src, "*.csv")) if re.search(rf"(^|[-_]){name}\.csv$", os.path.basename(p))]
    if not hits: sys.exit(f"missing {name}.csv")
    return hits[0]
def read(name):
    with open(find(name), encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter=";"))

hyr = read("Hyr"); mp = read("MP"); stof = read("Stof"); sam = read("Sam"); mpp = read("MPP"); links = read("Ggr_Link")
stof_by = {s["StofCV"]: s for s in stof}
titles = {h["HYR"]: h["TI"].strip() for h in hyr}
link_by_mpp = {l["Mppcv"]: l["Link2MPG"] for l in links}
amppid = lambda url: (re.search(r"amppid=(\d+)", url or "") or [None, None])[1]

# Substances of each product (MP), by rank.
subs = defaultdict(dict)
for r in sam:
    base = stof_by.get(r["Stofcv"], {}).get("FBase") or r["StofNm_"]
    subs[r["mpcv_"]][base.strip()] = min(int(r["InRank"] or 99), subs[r["mpcv_"]].get(base.strip(), 99))
# One CBIP page per product.
page = {}
for p in mpp:
    if p["mpcv"] not in page and p["mppcv"] in link_by_mpp:
        page[p["mpcv"]] = amppid(link_by_mpp[p["mppcv"]])

entries = {}
for m in mp:
    if m["Amb"] != "true": continue
    hyr_code = m["Hyr_"]
    if "homéopath" in titles.get(hyr_code, "").lower() or "homéopath" in titles.get(hyr_code[:3], "").lower(): continue
    s = subs.get(m["MPcv"])
    if not s: continue
    names = [n for n, _ in sorted(s.items(), key=lambda kv: (kv[1], kv[0]))]
    key = " + ".join(names)
    e = entries.setdefault(key, {"n": key, "b": [], "h": Counter()})
    e["b"].append([m["MPnm"].strip(), page.get(m["MPcv"])])
    e["h"][hyr_code] += 1

out = []
for e in entries.values():
    brands = sorted({b[0]: b for b in e["b"]}.values(), key=lambda b: b[0].lower())
    out.append({"n": e["n"], "h": e["h"].most_common(1)[0][0], "b": brands[:40]})
out.sort(key=lambda e: e["n"].lower())
used = set()
for e in out:
    for i in range(1, len(e["h"]) + 1): used.add(e["h"][:i])
data = {"chapters": {k: titles[k] for k in sorted(used) if k in titles}, "entries": out}
dst = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "preop", "cbip-data.json")
with open(dst, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print(len(out), "entries,", sum(len(e["b"]) for e in out), "brands,", os.path.getsize(dst) // 1024, "KB")

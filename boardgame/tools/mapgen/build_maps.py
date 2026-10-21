#!/usr/bin/env python3
"""Generate the shipped map set into boardgame/public/maps/.

    python3 build_maps.py --count 100 --cells 700 --seed 1000

Every map written has passed Map.validate(): fair starts (IMPLEMENTATION_SPEC.md
section 1.1), no Site touching the Chieftain start, and the generator's own size
and buildability checks. Maps that fail every retry are skipped, not shipped.
"""
import argparse
import json
import os
from collections import Counter

from landgrab_mapgen import generate_valid

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "maps"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=100)
    ap.add_argument("--cells", type=int, default=700)
    ap.add_argument("--seed", type=int, default=1000)
    ap.add_argument("--relaxation", type=int, default=3)
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    index = []
    degree_hist = Counter()
    skipped = 0
    seed = args.seed
    while len(index) < args.count:
        m, attempts = generate_valid(args.cells, 4, seed, args.relaxation, max_attempts=40, verbose=False)
        seed += 100_003  # retries step by 977; keep seeds from overlapping
        if m.validate():
            skipped += 1
            continue
        data = m.to_dict()
        map_id = f"map_{len(index):03d}"
        data["id"] = map_id
        path = os.path.join(args.out, f"{map_id}.json")
        with open(path, "w") as f:
            json.dump(data, f, separators=(",", ":"))
        land = [c for c in data["cells"] if c["terrain"] not in ("Ocean", "CoastalWater", "CraterLake")]
        for c in land:
            degree_hist[len(c["neighbors"])] += 1
        index.append({
            "id": map_id,
            "seed": data["seed"],
            "cells": len(data["cells"]),
            "land": len(land),
            "bytes": os.path.getsize(path),
        })
        print(f"{map_id} seed={data['seed']} land={len(land)} attempts={attempts} {os.path.getsize(path)//1024}KB")

    with open(os.path.join(args.out, "index.json"), "w") as f:
        json.dump({"schema": "landgrab.maps/1", "maps": index}, f, indent=1)
    total = sum(degree_hist.values())
    print(f"\nwrote {len(index)} maps to {args.out} (skipped {skipped} seeds that never validated)")
    print("land-cell degree histogram:", dict(sorted(degree_hist.items())),
          f"max={max(degree_hist)}", f"mean={sum(k*v for k,v in degree_hist.items())/total:.2f}")


if __name__ == "__main__":
    main()

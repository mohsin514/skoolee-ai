"""Replace text inside a single top-level function block of a .tsx file.

The operations console repeats `const add = …`, `const del = …` and the same
markup eighteen times, so whole-file anchors are ambiguous. Scoping each edit
to one function makes short anchors safe.
"""
import re, sys

def read(path):
    return open(path).read()

def block_bounds(src, fname):
    m = re.search(r'^(?:export )?function %s\(' % re.escape(fname), src, re.M)
    if not m:
        raise SystemExit(f"function {fname} not found")
    start = m.start()
    nxt = re.search(r'^(?:export )?function ', src[m.end():], re.M)
    end = m.end() + nxt.start() if nxt else len(src)
    return start, end

def edit(path, fname, pairs):
    src = read(path)
    a, b = block_bounds(src, fname)
    block = src[a:b]
    for old, new in pairs:
        n = block.count(old)
        if n != 1:
            raise SystemExit(f"{fname}: anchor found {n}x -> {old[:70]!r}")
        block = block.replace(old, new)
    open(path, "w").write(src[:a] + block + src[b:])
    print(f"  {fname}: {len(pairs)} edit(s) applied")

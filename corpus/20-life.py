def step(g):
    h, w = len(g), len(g[0]); o = []
    for y in range(h):
        r = ""
        for x in range(w):
            n = sum(g[y+dy][x+dx] == "#" for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                    if (dy or dx) and 0 <= y+dy < h and 0 <= x+dx < w)
            r += "#" if n == 3 or (n == 2 and g[y][x] == "#") else "."
        o.append(r)
    return o
g = [".....", "..#..", "..#..", "..#..", "....."]
for _ in range(2):
    g = step(g)
    print("\n".join(g))
    print()

def solve(n, row=0, cols=(), d1=(), d2=()):
    if row == n: return 1
    t = 0
    for c in range(n):
        if c in cols or row - c in d1 or row + c in d2: continue
        t += solve(n, row + 1, cols + (c,), d1 + (row - c,), d2 + (row + c,))
    return t
print(solve(6), solve(8))

def lcs(a, b):
    t = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            t[i][j] = t[i-1][j-1] + 1 if a[i-1] == b[j-1] else max(t[i-1][j], t[i][j-1])
    return t[-1][-1]
def edit(a, b):
    p = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        c = [i]
        for j, cb in enumerate(b, 1):
            c.append(min(p[j] + 1, c[j-1] + 1, p[j-1] + (ca != cb)))
        p = c
    return p[-1]
print(lcs("AGGTAB", "GXTXAYB"), edit("kitten", "sitting"))

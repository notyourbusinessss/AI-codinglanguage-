best = (0, 0)
for n in range(1, 100000):
    x = n; c = 1
    while x != 1:
        x = x // 2 if x % 2 == 0 else 3 * x + 1
        c += 1
    if c > best[1]: best = (n, c)
print(best[0], best[1])

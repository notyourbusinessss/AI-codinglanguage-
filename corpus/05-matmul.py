def mm(a, b): return [[sum(x * y for x, y in zip(r, c)) for c in zip(*b)] for r in a]
a = [[1, 2, 3], [4, 5, 6]]
b = [[7, 8], [9, 10], [11, 12]]
for r in mm(a, b): print(' '.join(map(str, r)))

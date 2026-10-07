def insert(t, v):
    if t is None: return (v, None, None)
    x, l, r = t
    if v < x: return (x, insert(l, v), r)
    if v > x: return (x, l, insert(r, v))
    return t
def inorder(t): return [] if t is None else inorder(t[1]) + [t[0]] + inorder(t[2])
def height(t): return 0 if t is None else 1 + max(height(t[1]), height(t[2]))
t = None
for v in [50, 30, 70, 20, 40, 60, 80, 30, 65]: t = insert(t, v)
print(' '.join(map(str, inorder(t))))
print(height(t))

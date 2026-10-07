def qs(l):
    if len(l) < 2: return l
    p, *r = l
    return qs([x for x in r if x < p]) + [p] + qs([x for x in r if x >= p])
def ms(l):
    if len(l) < 2: return l
    m = len(l) // 2
    a, b = ms(l[:m]), ms(l[m:])
    o = []
    while a and b: o.append(a.pop(0) if a[0] <= b[0] else b.pop(0))
    return o + a + b
xs = [38, 27, 43, 3, 9, 82, 10, 3]
print(' '.join(map(str, qs(xs))))
print(' '.join(map(str, ms(xs))))

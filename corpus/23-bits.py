def pop(n): return bin(n).count("1")
def pow2(n): return n > 0 and n & (n - 1) == 0
def gray(n): return n ^ (n >> 1)
print(pop(255), pop(1023), pop(0))
print(' '.join("y" if pow2(n) else "n" for n in [1, 2, 3, 64, 100]))
print(' '.join(format(gray(i), "03b") for i in range(8)))
x, y = 12, 25
x ^= y; y ^= x; x ^= y
print(x, y)

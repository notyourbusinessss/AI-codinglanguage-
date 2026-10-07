def gcd(a, b): return a if b == 0 else gcd(b, a % b)
def is_prime(n):
    if n < 2: return False
    i = 2
    while i * i <= n:
        if n % i == 0: return False
        i += 1
    return True
print(gcd(48, 18), gcd(17, 5))
print(' '.join(str(n) for n in range(2, 50) if is_prime(n)))
print(sum(n for n in range(2, 1000) if is_prime(n)))

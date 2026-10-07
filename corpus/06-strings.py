def caesar(s, k): return ''.join(chr((ord(c) - 97 + k) % 26 + 97) if 'a' <= c <= 'z' else c for c in s)
def pal(s):
    t = [c for c in s.lower() if c.isalnum()]
    return t == t[::-1]
print(caesar("hello world", 3))
print(caesar(caesar("hello world", 3), -3))
print("yes" if pal("A man, a plan, a canal: Panama") else "no", "yes" if pal("hello") else "no")
print(' '.join(reversed("the quick brown fox".split())))
print(sum(c in "aeiou" for c in "programming language"))

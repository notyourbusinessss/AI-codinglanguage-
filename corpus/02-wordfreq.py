import sys
from collections import Counter
c = Counter(sys.stdin.read().split())
for w, n in sorted(c.items(), key=lambda kv: (-kv[1], kv[0])):
    print(w, n)

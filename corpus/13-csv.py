import sys
from collections import defaultdict
g = defaultdict(list)
for line in sys.stdin.read().strip().split("\n"):
    n, d, s = line.split(","); g[d].append(int(s))
for d in sorted(g): print(d, sum(g[d]), sum(g[d]) // len(g[d]))

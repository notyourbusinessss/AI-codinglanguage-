import heapq
g = {"a": {"b": 7, "c": 9, "f": 14}, "b": {"a": 7, "c": 10, "d": 15}, "c": {"a": 9, "b": 10, "d": 11, "f": 2},
     "d": {"b": 15, "c": 11, "e": 6}, "e": {"d": 6, "f": 9}, "f": {"a": 14, "c": 2, "e": 9}}
def dij(s):
    dist = {s: 0}
    pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, 10**9): continue
        for v, w in g[u].items():
            nd = d + w
            if nd < dist.get(v, 10**9):
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist
d = dij("a")
for k in sorted(d): print(k, d[k])

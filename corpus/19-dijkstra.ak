g={:a {:b 7 :c 9 :f 14} :b {:a 7 :c 10 :d 15} :c {:a 9 :b 10 :d 11 :f 2} :d {:b 15 :c 11 :e 6} :e {:d 6 :f 9} :f {:a 14 :c 2 :e 9}}
dij s =
 dist={s 0} pq=[[0 s]] (wh pq pq=sort(pq) [d u]=pq[0] pq=pq[1..] (? d<=(dist[u]??1000000000) (for [v w] g[u] nd=d+w (? nd<(dist[v]??1000000000) (: dist[v]=nd push(pq [nd v])))))) dist
for [k v] sort(dij("a")) p(k v)

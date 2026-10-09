g={}
for line split(trim((inall)) "\n") [_ d s]=split(line ",") g[d]??=[] push(g[d] num(s))
for [d v] sort(g) p(d sum(v) sum(v)//#v)

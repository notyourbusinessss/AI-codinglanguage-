; gcmin: 100000        (GC-stress headroom used by tests/native_diff.js for this allocation-heavy program)
; Allocates well past the default collection threshold (64 MB) so the collector runs without any stress setting,
; while globals, a growing list and a map keep data alive.
xs=[1 2 3]
m={:a "x" :b [1 2]}
big=[]
s="start"
(for i 2500000
  s=(++ "item" i)
  (? i%250000==0 (push big s)))
(p xs m big s)
total=0
(for i 400000 [a b]=[i i*2] total+=a+b)
(p total)

; NaN is a usable map key (equal to itself), like a JS Map; -0 and 0 are the same key
n=(sqrt -1)
m={}
(<@ m n 5)
(<@ m 0 "zero")
(<@ m (- 0) "negzero")
(<@ m n 6)
(p #m m[n] m[(sqrt -4)] m[0] (has (keys m) n) (~ k=>(== k k) (keys m)))
m=(del m n)
(p #m m[n])

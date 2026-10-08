; maps: small (no index) to large (hashed), string / integer / mixed keys, deletes, re-inserts, literals, iteration order
(= (digest m) (join (~ [k v]=>(++ ($ k) "=" ($ v)) (enum m)) ","))
m={}
(for n 40
  (<@ m (++ "k" n) n)
  (? n%5==0 (p n #m m[(++ "k" (// n 2))] (digest m)[..30])))
(for n 40 (? n%3==0 m=(del m (++ "k" n))))
(p #m (digest m)[..50] m.k1 m["k3"] m["k4"])
(for n 40 (<@ m (++ "k" n) (* n 10)))
(p #m (sum (vals m)) (keys m)[..4])
i={}
(for n 30 (<@ i (* n 7) n) (<@ i (- n) (* n n)))
(p #i i[14] i[-5] i[8] i[0] (sum (vals i)))
i=(del i 14)
(p #i i[14] (has (keys i) 21))
x={}
(<@ x 1 "int") (<@ x "1" "str") (<@ x 1.5 "flt") (<@ x true "t") (<@ x nil "n")
(p #x x[1] x["1"] x[1.5] x[true] x[nil] x[2])
r={:a 1 :b 2 :c 3}
r.d=4
r["e"]=5
r.a+=10
(p r (keys r) #r r.a r["b"] r.zz)
lit={:x 1 :y {:z [1 2 3] :w "deep"} :k "v"}
lit.y.z[1]=99
(p lit lit.y.z lit["y"]["w"])
big={}
(for n 2000 (<@ big (++ "key" n) n))
t=0
(for n 2000 t+=big[(++ "key" n)])
(p #big t big.key1999 big.key2000 (idx (keys big) "key1500"))
(for n 2000 (? n%2 big=(del big (++ "key" n))))
(p #big (sum (vals big)) big.key3 big.key4)
q={}
(for rnd 5 (for n 300 (<@ q (* n (+ rnd 1)) rnd)) (for n 300 (? n%4==0 q=(del q (* n (+ rnd 1))))))
(p #q (sum (vals q)))
(p (try (<@ 5 "a" 1) e=>"err1") (try (@ nil "a") e=>"err2") (try (@ 5 "a") e=>"err3"))

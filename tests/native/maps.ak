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
; map literals of every size share their array, so the table that grows out of them need not be a power of two
(for n 9
  lit=(? n==0 {} n==1 {:a 1} n==2 {:a 1 :b 2} n==3 {:a 1 :b 2 :c 3} n==4 {:a 1 :b 2 :c 3 :d 4} n==5 {:a 1 :b 2 :c 3 :d 4 :e 5}
         n==6 {:a 1 :b 2 :c 3 :d 4 :e 5 :f 6} n==7 {:a 1 :b 2 :c 3 :d 4 :e 5 :f 6 :g 7} {:a 1 :b 2 :c 3 :d 4 :e 5 :f 6 :g 7 :h 8})
  (for k 25 (<@ lit (++ "x" k) k+100) (? k%6==0 lit.dot=k))
  ok=0
  (for k 25 (? lit[(++ "x" k)]==k+100 ok+=1))
  (p "literal of" n "keys, grown to" #lit ": found" ok "of 25, dot" lit.dot (? (> n 0) lit.a nil)))
w={:fd 3 :rbuf "" :seq 0 :queue [] :keys nil}
w.base=1 w.mask=2 w.mincode=8 w.maxcode=255 w.root=5 w.white=6 w.black=7 w.sw=1024 w.sh=768 w.visual=9 w.depth=24
(p w.base w.mask w.mincode w.maxcode w.root w.white w.black w.sw w.sh w.visual w.depth w.keys #w)

; GC torture: every kind of heap value is held in globals, locals, closures and handler frames while garbage churns.
; Run under AK_GCMIN=<small> the collector runs thousands of times; the output must not change.
G1=[1 2 3 [4 5 [6]]]
G2={:a 1 :b "two" :c [3 4] :d {:e "deep"}}
G3=(++ "glob" 12345)
G4=(u8 16)
G5=(f64 4)
G6=123456789012345678901234567890n*987654321n
G7=(\ (x) x+G1[0])
G8=(~ i=>(++ "item" i) 0..50)
(for i 16 (<@ G4 i i*3))
(for i 4 (<@ G5 i i/4))
(= (counter) n=0 (\ () (: (<- n n+1) n)))
G9=(counter)
(= (churn n)
  (for i n s=(++ "garbage" i) t=[i i+1 s] u={:k t :s s} (<@ u "z" [t t]))
  nil)
(= (digest v) #(json v))
(= (deep n acc)
  (? n==0 (digest acc)
     (: x=[n (++ "d" n) {:n n}] (churn 40) r=(deep n-1 [..acc x]) (churn 10) r+(digest x))))
(= (mkcounters k) (~ i=>(: c=(counter) (churn 20) c) 0..k))
(= (guarded n)
  loc=[n (++ "loc" n) {:q n}]
  (try (: (churn 30) (// 1 0)) e=>(: (churn 30) (++ e " " (json loc)))))
T={}
rounds=60
(for r rounds
  T[(++ "k" r)]=[r (++ "v" r) {:r r :l (~ i=>i*r 0..5)}]
  (churn 300)
  (? r%7==0 (: (G9) (G9)))
  (? r%10==0 (p "round" r (digest T) (guarded r))))
cs=(mkcounters 5)
(p (~ c=>(c) cs) (~ c=>(c) cs))
(p (deep 120 []))
(p G1 G2 G3 G4[5] G4[15] G5[3] G6 (G7 10) (G9) #G8 G8[49])
(p (digest T) (sort (keys T))[0..3] T["k59"])

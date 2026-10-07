; recursion with TCO
(= (fib n a b) (? (== n 0) a (fib (- n 1) b (+ a b))))
(p "fib 50 =" (fib 50 0 1))
; functional pipeline
(p (~ (\ (x) (* x x)) (~? (\ (x) (== 0 (% x 2))) (.. 1 11))))
; maps, keywords, let, for
(= db {:a 1 :b 2})
(for (k (keys db)) (p k (@ db k)))
(p (let (x 3 y (* x 2)) (+ x y)))
; varargs + try
(= (sum-all .. xs) (sum xs))
(p (sum-all 1 2 3 4))
(p (try (/ 1 0) (\ (e) (++ "caught: " e))))
; loop 1e6 deep without stack growth
(= (cnt i) (? (< i 1000000) (cnt (+ i 1)) i))
(p (cnt 0))

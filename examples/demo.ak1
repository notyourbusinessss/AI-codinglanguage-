; recursion with TCO (self tail call -> loop)
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
; 5M-deep mutual recursion (big stack)
(= (ev? n) (? (== n 0) T (od? (- n 1))))
(= (od? n) (? (== n 0) F (ev? (- n 1))))
(p (ev? 3000000))
(= path (req "path"))
; sw (switch), JS interop, dotted paths, stdin
(p (sw 3 1 :one [2 3] :few :many))
(p (Math.max 1 9 4) (. "abc" :toUpperCase) (path.basename "/a/b.txt"))
(p (in) (in) (in))
; async: (aw ..) makes the enclosing function async automatically
(aw (delay 5))
(p "done" (# (args)))

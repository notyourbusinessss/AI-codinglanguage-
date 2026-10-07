(use "../src/parse.ak")
(use "../src/lower.ak")
; smoke driver: lower a file against a stub prelude and print the IR
pre=(parse "(= (list ..a) a) (= (map ..a) a) (= (at l i) 0) (= (slice l a b) 0) (= (toarr x) x) (= (concat ..a) a) (= (iter x) x) (= (isnum x) 0) (= (len x) 0) (= (apply f l) 0) (= (put a b c) 0) (= (dot a b) 0) (= (setdot a b c) 0) (= (p ..x) x) (= (+ ..a) 0) (= (push l ..x) l) (= (< a b) 0) (= (> a b) 0) (= (<= a b) 0) (= (>= a b) 0) (= (== a b) 0) (= (!= a b) 0) (= (- ..a) 0) (= (* ..a) 0) (= (/ ..a) 0) (= (% a b) 0) (= (// a b) 0) (= (** a b) 0) (= (! a) 0) (= (& ..a) 0) (= (| ..a) 0) (= (^ ..a) 0) (= (<< a b) 0) (= (>> a b) 0) (= (>>> a b) 0) (= (bnot a) 0)" "pre")
f=(args)[0]
user=(~ y=>(expand y (dirname f) {}) (parse (rd f) f))
main=(lower_program pre user f)
(for fn L.funcs
  (? fn.name!="main" (p "fn#" fn.id fn.name "params" fn.nparams "nslots" fn.nslots "free" (~ v=>v.name fn.free) (irdump fn.body))))
(p "main:" (irdump main.body))

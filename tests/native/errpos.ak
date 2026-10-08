; error positions of failing comparisons used as conditions (the failing expression's own line:col)
x=7
(= (f) (? (< x nil) 1 2))
(= (g) (? (! (< x nil)) 1 2))
(= (h) (wh (&& (< x 9) (< x nil)) (p 1)))
(= (k) (? (&& (< x 9) (! (> x "a"))) 1 2))
(= (pos e) (? (starts e "cannot compare num and nil") "cmp-nil" (starts e "cannot compare num and str") "cmp-str" e))
(p (try (f) e=>(pos e)) (try (g) e=>(pos e)) (try (h) e=>(pos e)) (try (k) e=>(pos e)))
(f)

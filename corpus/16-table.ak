rows=[["apple" 3 150] ["kiwi" 12 20] ["melon" 1 499]]
(for [n q pr] rows (p (fmt "%-8s%4d%6d" n q pr)))
(p (rpt "-" 18))
(p (fmt "%-8s%10d" "total" (sum (~ [_ q pr]=>q*pr rows))))

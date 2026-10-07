rows=[["apple" 3 150] ["kiwi" 12 20] ["melon" 1 499]]
(for r rows (p (++ (padr r[0] 8) (padl r[1] 4) (padl r[2] 6))))
(p (rpt "-" 18))
(p (++ (padr "total" 8) (padl (sum (~ r=>r[1]*r[2] rows)) 10)))

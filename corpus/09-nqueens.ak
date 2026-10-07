(= (solve n row cols d1 d2) (? row==n 1 (let (t 0) (for c (.. n) (? !((has cols c)||(has d1 row-c)||(has d2 row+c)) t+=(solve n row+1 (+> cols c) (+> d1 row-c) (+> d2 row+c)))) t)))
(p (solve 6 0 [] [] []) (solve 8 0 [] [] []))

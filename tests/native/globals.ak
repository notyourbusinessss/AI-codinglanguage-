x=5
y=x*2
(= (setx) (<- x 99))
(setx)
(p x y)
total=0
(= (add n) (<- total total+n))
(for i 5 (add i))
(p total)
(= (shadow) x=1 x)
(p (shadow) x)

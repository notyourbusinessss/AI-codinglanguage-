bn=0
bc=0
(for n 1..100000 (let (x n c 1) (wh x!=1 x=(? 0==x%2 x//2 3*x+1) c+=1) (? c>bc (: bn=n bc=c))))
(p bn bc)

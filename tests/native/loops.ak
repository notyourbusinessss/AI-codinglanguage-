s=0
(for i 10 s+=i)
(p s)
t=0
(for i 2..6 t+=i*i)
(p t)
n=5 f=1
(wh n>1 f*=n n-=1)
(p f)
(for i 3 (for j 3 (? i==j (p i j))))
k=0
(for 4 k+=2)
(p k)
x=10
(wh x>0 x-=3)
(p x)

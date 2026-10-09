bn=bc=0
for n 1..100000 x=n c=1 (wh x!=1 x=(? x%2 3*x+1 x//2) c+=1) (? c>bc [bn bc]=[n c])
p bn bc

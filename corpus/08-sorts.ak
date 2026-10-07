(= (qs l) (? #l<2 l (let (p l[0] r (drop 1 l)) (++ (qs (~? x=>x<p r)) [p] (qs (~? x=>x>=p r))))))
(= (ms l) (? #l<2 l (let (m #l//2 a (ms (sub l 0 m)) b (ms (sub l m)) i 0 j 0 o []) (wh i<#a&&j<#b (? a[i]<=b[j] (: (push o a[i]) i+=1) (: (push o b[j]) j+=1))) (++ o (sub a i) (sub b j)))))
xs=[38 27 43 3 9 82 10 3]
(p (join (qs xs) " "))
(p (join (ms xs) " "))

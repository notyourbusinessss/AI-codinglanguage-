(= (lcs a b) (let (n #a m #b t (~ i=>(~ j=>0 (.. m+1)) (.. n+1))) (for i 1..n+1 (for j 1..m+1 t[i][j]=(? a[i-1]==b[j-1] 1+t[i-1 j-1] (max t[i-1 j] t[i j-1])))) t[n m]))
(= (edit a b) (let (p (.. #b+1)) (for i 1..#a+1 (let (c [i]) (for j 1..#b+1 (push c (min 1+p[j] 1+c[j-1] p[j-1]+(? a[i-1]==b[j-1] 0 1)))) p=c)) (lst p)))
(p (lcs "AGGTAB" "GXTXAYB") (edit "kitten" "sitting"))

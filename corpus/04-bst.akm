(= (ins t v) (? t==nil [v nil nil] (let (x t[0] l t[1] r t[2]) (? v<x [x (ins l v) r] v>x [x l (ins r v)] t))))
(= (inorder t) (? t==nil [] (++ (inorder t[1]) [t[0]] (inorder t[2]))))
(= (height t) (? t==nil 0 1+(max (height t[1]) (height t[2]))))
t=nil
(for v [50 30 70 20 40 60 80 30 65] t=(ins t v))
(p (join (inorder t) " "))
(p (height t))

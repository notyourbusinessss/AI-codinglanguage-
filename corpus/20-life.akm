(= (step g) (let (h #g w #g[0]) (~ y=>(join (~ x=>(let (n 0) (for dy [-1 0 1] (for dx [-1 0 1] (? (dy!=0||dx!=0)&&y+dy>=0&&y+dy<h&&x+dx>=0&&x+dx<w&&"#"==g[y+dy x+dx] n+=1))) (? n==3||n==2&&"#"==g[y x] "#" ".")) (.. w)) "") (.. h))))
g=["....." "..#.." "..#.." "..#.." "....."]
(for i (.. 2)
g=(step g)
(p (join g "\n"))
(p ""))

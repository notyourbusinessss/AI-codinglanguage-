(= (work n d) (aw (delay d)) n*n)
(p ..(aw (Promise.all (~ i=>(work i 10*(5-i)) 0..5))))

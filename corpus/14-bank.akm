(= (apply bal op amt) (sw op "dep" bal+amt "wd" (? amt>bal (err "insufficient funds") bal-amt) (err "bad op" op)))
bal=0
(for x [["dep" 100] ["wd" 30] ["wd" 100] ["xfer" 5] ["dep" 50]] (try (: bal=(apply bal x[0] x[1]) (p "ok" bal)) e=>(p "error:" e)))

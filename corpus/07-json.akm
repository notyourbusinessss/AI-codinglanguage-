s=(json {:users [{:name "ann" :age 31} {:name "bob" :age 25} {:name "cy" :age 40}]})
(p s)
us=(unjson s)[:users]
(p (sum (~ u=>u[:age] us))//#us)
(p (join (~ u=>u[:name] (~? u=>u[:age]>30 us)) " "))

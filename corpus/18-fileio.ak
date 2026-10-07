f="/tmp/corpus_18.txt"
(wr f "one two three\nfour five\nsix\n")
lines=(split (trim (rd f)) "\n")
(for [i l] (enum lines) (p i+1 #(split l) (up l)))
(p (sum (~ l=>#(split l) lines)))
(rm f)

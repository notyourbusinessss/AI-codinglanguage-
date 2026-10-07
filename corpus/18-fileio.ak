f="/tmp/corpus_18.txt"
(wr f "one two three\nfour five\nsix\n")
lines=(split (trim (rd f)) "\n")
(for i (.. #lines) (p i+1 #(split lines[i]) (up lines[i])))
(p (sum (~ l=>#(split l) lines)))
fs.unlinkSync(f)

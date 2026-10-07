pairs={")" "(" "]" "[" "}" "{"}
(= (bal s) (let (st [] ok true) (for c (split s "") (? (has "([{" c) (push st c) (has (keys pairs) c) (? #st==0||(pop st)!=pairs[c] ok=false))) ok&&#st==0))
(for s ["([]{})" "([)]" "((" "{[()]}()"] (p (? (bal s) "yes" "no")))

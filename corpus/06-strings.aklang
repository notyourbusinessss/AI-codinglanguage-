caesar s k =
 join((~ c=>(? "a"<=c<="z" chr(97+(ord(c)-97+k)%26) c) [..s]) "")
pal s =
 t=rep(lo(s) re("[^a-z0-9]" "g") "") t==rev(t)
p caesar("hello world" 3)
p caesar(caesar("hello world" 3) -3)
p (? pal("A man, a plan, a canal: Panama") "yes" "no") (? pal("hello") "yes" "no")
p ..rev(split("the quick brown fox"))
p #(~? c=>has("aeiou" c) [.."programming language"])

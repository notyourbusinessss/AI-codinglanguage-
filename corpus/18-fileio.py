import os
f = "/tmp/corpus_18.txt"
with open(f, "w") as fh: fh.write("one two three\nfour five\nsix\n")
lines = open(f).read().splitlines()
for i, l in enumerate(lines, 1): print(i, len(l.split()), l.upper())
print(sum(len(l.split()) for l in lines))
os.remove(f)

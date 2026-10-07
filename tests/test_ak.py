import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import ak

def r(src): return ak.show(ak.run(src, ak.globals_()))

CASES = [
    ('(+ 1 2 3)', '6'), ('(- 5)', '-5'), ('(/ 6 3)', '2'), ('(/ 1 2)', '0.5'),
    ('(? F 1 T 2)', '2'), ('(? F 1 9)', '9'), ('(? F 1)', '_'),
    ('(= (f x) (* x 2)) (f 4)', '8'),
    ('((\\ (a .. r) r) 1 2 3)', '[2 3]'),
    ('(~ + [1 2] [10 20])', '[11 22]'),
    ('(~/ + 0 [1 2 3])', '6'), ('(~/ + [1 2 3])', '6'),
    ('(@ [1 2 3] -1)', '3'), ('(@ [1 2 3 4] 1 3)', '[2 3]'), ('(@ {:a 1} :a)', '1'),
    ('(@ [1] 9)', '_'),
    ('(set {:a 1} :b 2)', '{:a 1 :b 2}'),
    ('(let (x 1 y (+ x 1)) y)', '2'),
    ('(= i 0) (wh (< i 5) (<- i (+ i 1))) i', '5'),
    ('(= (c i) (? (< i 200000) (c (+ i 1)) i)) (c 0)', '200000'),
    ('(try (err "boom") (\\ (e) e))', '"boom"'),
    ('(try (/ 1 0) (\\ (e) e))', '"division by zero"'),
    ('(== 1 T)', 'F'), ('(& 1 2)', '2'), ('(| F _ 3)', '3'),
    ('(++ "a" 1 :k)', '"a1:k"'), ('(++ [1] [2])', '[1 2]'),
    ('(sort (\\ (x) (- x)) [1 3 2])', '[3 2 1]'),
    ('(ty :a)', ':kw'), ('(is :num 3)', 'T'),
    ('(= c 0) (for (i (.. 4)) (<- c (+ c i))) c', '6'),
]
bad = 0
for src, want in CASES:
    try: got = r(src)
    except Exception as e: got = 'EXC ' + str(e)
    if got != want: bad += 1; print('FAIL', src, '->', got, '!=', want)
print(f'{len(CASES) - bad}/{len(CASES)} passed'); sys.exit(bad > 0)

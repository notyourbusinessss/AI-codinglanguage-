def roman(n):
    o = ""
    for v, s in [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
                 (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]:
        while n >= v:
            o += s
            n -= v
    return o
for n in [4, 9, 14, 1994, 2024]: print(n, roman(n))

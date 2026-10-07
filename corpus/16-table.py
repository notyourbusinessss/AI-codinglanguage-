rows = [("apple", 3, 150), ("kiwi", 12, 20), ("melon", 1, 499)]
for n, q, pr in rows: print(n.ljust(8) + str(q).rjust(4) + str(pr).rjust(6))
print("-" * 18)
print("total".ljust(8) + str(sum(q * pr for _, q, pr in rows)).rjust(10))

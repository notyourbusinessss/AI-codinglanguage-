def apply(bal, op, amt):
    if op == "dep": return bal + amt
    if op == "wd":
        if amt > bal: raise ValueError("insufficient funds")
        return bal - amt
    raise ValueError("bad op " + op)
bal = 0
for op, amt in [("dep", 100), ("wd", 30), ("wd", 100), ("xfer", 5), ("dep", 50)]:
    try:
        bal = apply(bal, op, amt)
        print("ok", bal)
    except ValueError as e:
        print("error:", e)

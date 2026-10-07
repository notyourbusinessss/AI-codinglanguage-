def bal(s):
    st = []
    pairs = {')': '(', ']': '[', '}': '{'}
    for c in s:
        if c in '([{': st.append(c)
        elif c in pairs:
            if not st or st.pop() != pairs[c]: return False
    return not st
for s in ["([]{})", "([)]", "((", "{[()]}()"]: print("yes" if bal(s) else "no")

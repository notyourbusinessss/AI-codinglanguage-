import json
data = {"users": [{"name": "ann", "age": 31}, {"name": "bob", "age": 25}, {"name": "cy", "age": 40}]}
s = json.dumps(data, separators=(',', ':'))
print(s)
d = json.loads(s)
print(sum(u["age"] for u in d["users"]) // len(d["users"]))
print(' '.join(u["name"] for u in d["users"] if u["age"] > 30))

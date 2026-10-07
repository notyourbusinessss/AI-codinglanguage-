(p (unjson "{\"a\": [1, 2.5, -3e2, true, false, null, \"x\\ny\\u00e9\\ud83d\\ude00\"], \"b\": {\"c\": {}, \"d\": []}}"))
(p (json (unjson "[1,{\"k\":\"v\"},[]]")))
(p (json (unjson "{\"a\":[1,2,{\"b\":null}],\"c\":\"d\"}") 2))
(p (unjson "  42  ") (unjson "\"s\"") (unjson "[]"))

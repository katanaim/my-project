#!/usr/bin/env python3
# Клиент к BQ-прокси (BQProxy.gs). Подставь URL и TOKEN своего задеплоенного веб-аппа.
# Использование:  python3 bq_client.py query.sql out.json   (или  ... < query.sql)
import json, sys, urllib.request
URL   = "ВСТАВЬ_URL_ВЕБАППА/exec"           # https://script.google.com/macros/s/…/exec
TOKEN = "ВСТАВЬ_СВОЙ_QUERY_TOKEN"           # тот, что положила в Script Properties
def q(sql):
    req = urllib.request.Request(URL, data=json.dumps({"token": TOKEN, "sql": sql}).encode(),
        headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=360))
if __name__ == "__main__":
    sql = open(sys.argv[1]).read() if len(sys.argv) > 1 else sys.stdin.read()
    sql = "\n".join(l for l in sql.splitlines() if not l.lstrip().startswith("--"))
    json.dump(q(sql), open(sys.argv[2], "w") if len(sys.argv) > 2 else sys.stdout, ensure_ascii=False)

#!/usr/bin/env bash
# Checks the isolation and credential claims against the running cluster. Each line prints PASS or FAIL.
# Needs kubectl access and internet (to pull curlimages/curl for the throwaway probe pods).
set -uo pipefail
BASE="${BASE:-http://storegate.localtest.me}"
pass=0; fail=0
check() { # check <description> <expected: 0 = command must succeed, 1 = must fail> <command...>
  local desc="$1" expect="$2"; shift 2
  if "$@" >/dev/null 2>&1; then got=0; else got=1; fi
  if [ "$got" = "$expect" ]; then echo "PASS  $desc"; pass=$((pass+1)); else echo "FAIL  $desc"; fail=$((fail+1)); fi
}
probe() { # run curl from a pod in an unrelated namespace
  kubectl run "probe-$RANDOM" -n default --rm -i --restart=Never --quiet --image=curlimages/curl:8.10.1 --command -- curl -sS -m 6 -o /dev/null -f "$1"
}
tcp_probe() { # raw TCP connect from an unrelated namespace: tcp_probe host port
  kubectl run "tcp-$RANDOM" -n default --rm -i --restart=Never --quiet --image=busybox:1.36 --command -- nc -z -w 5 "$1" "$2"
}
from_gateway() { # run a Node one-liner inside the gateway pod (which is allowed to reach upstreams)
  kubectl exec -n platform deploy/gateway -- node -e "$1"
}

echo "Network isolation (a pod in the default namespace is the attacker)"
check "woo-mcp is NOT reachable from another namespace"  1 probe http://woo-mcp.store.svc.cluster.local:8080/healthz
check "WordPress is NOT reachable from another namespace" 1 probe http://wordpress.store.svc.cluster.local/wp-login.php
check "MariaDB is NOT reachable from another namespace"   1 tcp_probe mariadb.store.svc.cluster.local 3306
check "Postgres is NOT reachable from another namespace"  1 tcp_probe postgres.platform.svc.cluster.local 5432
check "fx-mcp is NOT reachable from another namespace"    1 probe http://fx-mcp.platform.svc.cluster.local:8080/healthz

echo "The gateway, and only the gateway, can reach woo-mcp"
check "gateway -> woo-mcp health"            0 from_gateway "fetch('http://woo-mcp.store.svc.cluster.local:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
check "gateway -> woo-mcp without a token is refused (401)" 0 from_gateway "fetch('http://woo-mcp.store.svc.cluster.local:8080/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:'{}'}).then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))"

echo "Public surface"
check "/mcp without an API key is refused (401)"  0 bash -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' $BASE/mcp)\" = 401 ]"
check "/api/servers without a session is refused"  0 bash -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/servers)\" = 401 ]"
check "/metrics is not exposed on the public host" 0 bash -c "! curl -s $BASE/metrics | grep -q gateway_tool_calls_total"
check "dashboard sends a Content-Security-Policy"   0 bash -c "curl -sI $BASE/ | grep -qi content-security-policy"

echo "Secrets"
check "no upstream token appears in the gateway's API output" 0 bash -c "! curl -s $BASE/api/servers | grep -qi token"

echo; echo "$pass passed, $fail failed"
[ "$fail" = 0 ]

#!/usr/bin/env bash
# Post-deployment check. Usage: bash deploy/smoke-test.sh https://your-domain   (works for http://localhost:3000 too)
set -u
URL="${1:?Usage: smoke-test.sh https://your-domain}"; URL="${URL%/}"; pass=0; fail=0
ok() { echo "PASS  $1"; pass=$((pass+1)); }; bad() { echo "FAIL  $1"; fail=$((fail+1)); }
t() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected $2, got $3)"; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
hdr() { curl -s -D - -o /dev/null "$@" | tr -d '\r'; }
t "Landing page loads" 200 "$(code "$URL/")"
t "Sign-in page loads" 200 "$(code "$URL/auth.html")"
t "Portal app loads" 200 "$(code "$URL/app/")"
t "Health check answers" '{"ok":true' "$(curl -s "$URL/api/health" | cut -c1-10)"
t "Pages are compressed" 1 "$(hdr -H 'Accept-Encoding: gzip' "$URL/app/app.js" | grep -ci '^content-encoding: gzip')"
t "Content-Security-Policy is set" 1 "$(hdr "$URL/" | grep -ci '^content-security-policy:')"
t "Server does not advertise Express" 0 "$(hdr "$URL/" | grep -ci '^x-powered-by:')"
t "Protected data needs sign-in" 401 "$(code "$URL/api/ideas")"
t "Cross-site style POST is blocked" 403 "$(code -X POST "$URL/api/auth/logout")"
t "Chat status answers" 1 "$(curl -s "$URL/api/chat/status" | grep -c '"open"')"
if [[ "$URL" == https://* ]]; then
  t "Browser-trusted HTTPS certificate" 200 "$(code "$URL/")"
  t "HSTS header is set" 1 "$(hdr "$URL/" | grep -ci '^strict-transport-security:')"
  t "HTTP redirects to HTTPS" 1 "$(code "http://${URL#https://}/" | grep -cE '^30[1278]$')"
fi
J="$(mktemp)"; R="$(curl -s -c "$J" -H 'X-Requested-With: portal' -H 'Content-Type: application/json' -d '{"identifier":"admin@demo.bw","password":"Demo@1234"}' "$URL/api/auth/login")"
t "Demo administrator can sign in" 1 "$(echo "$R" | grep -c '"ok":true')"
t "Signed-in dashboard data loads" 1 "$(curl -s -b "$J" "$URL/api/reports/summary" | grep -c '"totals"')"
rm -f "$J"; echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]

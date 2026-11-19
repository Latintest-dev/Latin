#!/usr/bin/env bash
# Runs every browser test against the app served locally.
# Needs: Python 3 with Playwright (pip install playwright) and Chrome (set CHROME=/path/to/chrome if it is not /usr/bin/google-chrome).
#   bash tests/e2e/run_all.sh            all browser tests
#   bash tests/e2e/run_all.sh drill      only tests whose file name contains "drill"
set -u
cd "$(dirname "$0")/../.."
python3 -m http.server 8765 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
status=0
for t in tests/e2e/*${1:-}*_test.py; do
  echo "== $t"
  python3 "$t" || status=1
done
exit $status

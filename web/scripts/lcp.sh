#!/usr/bin/env bash
# LCP ekranu harmonogramu w Lighthouse: build produkcyjny z serwera w trybie demo, profil „Fast 3G”
# (562,5 ms RTT, 1,44 Mb/s w dół, 675 kb/s w górę, CPU ×4), pierwsze wejście (zimne) i drugie (z cache i service workerem).
# Użycie (po `pnpm -r build`): pnpm --filter @etner/web lcp   [CHROME=/ścieżka/do/chrome]
# Wynik: LCP w ms dla obu wejść i raporty JSON w $OUT. Kod wyjścia 1, gdy LCP z cache ≥ 1000 ms.
set -euo pipefail
cd "$(dirname "$0")/../.."
CHROME=${CHROME:-/opt/pw-browsers/chromium}
PORT=${PORT:-4791}
DBG=${DBG:-9333}
OUT=${OUT:-$(mktemp -d -t etner-lcp-XXXX)}
DATA=$(mktemp -d -t etner-lcp-data-XXXX)
URL="http://127.0.0.1:$PORT/#harm"

DEMO=1 PUMBLE_FAKE=1 DATA_DIR="$DATA" PORT=$PORT NODE_ENV=test node server/dist/main.js >"$OUT/server.log" 2>&1 &
SRV=$!
CHR=
trap 'kill $SRV ${CHR:-} 2>/dev/null || true; rm -rf "$DATA"' EXIT
for _ in $(seq 60); do curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 0.5; done

# sesja admina demo (konto i hasło z listy kont demo)
read -r LOGIN HASLO < <(curl -sf "http://127.0.0.1:$PORT/api/demo/konta" | jq -r '[.[] | select(.role == "admin")][0] | "\(.login) \(.haslo)"')
COOKIE=$(curl -sf -o /dev/null -D - -H 'content-type: application/json' -d "{\"login\":\"$LOGIN\",\"haslo\":\"$HASLO\"}" "http://127.0.0.1:$PORT/api/login" | sed -n 's/^[Ss]et-[Cc]ookie: \([^;]*\).*/\1/p' | head -1)
[ -n "$COOKIE" ] || { echo "Brak sesji demo" >&2; exit 2; }

# jedna przeglądarka i jeden profil na oba wejścia: drugie ma HTTP cache, service worker i dane w IndexedDB
"$CHROME" --headless --no-sandbox --remote-debugging-port=$DBG --user-data-dir="$OUT/profile" ${CHROME_FLAGS:-} about:blank >"$OUT/chrome.log" 2>&1 &
CHR=$!
for _ in $(seq 40); do curl -sf "http://127.0.0.1:$DBG/json/version" >/dev/null && break; sleep 0.25; done

run() {
  npx --yes lighthouse@13.6.0 "$URL" --port=$DBG --quiet --output=json --output-path="$OUT/$1.json" \
    --only-categories=performance --form-factor=mobile --screenEmulation.mobile --screenEmulation.width=390 --screenEmulation.height=844 --screenEmulation.deviceScaleFactor=3 \
    --throttling-method=devtools --throttling.requestLatencyMs=562.5 --throttling.downloadThroughputKbps=1474.56 --throttling.uploadThroughputKbps=675 --throttling.cpuSlowdownMultiplier=4 \
    --extra-headers="{\"Cookie\":\"$COOKIE\"}" "${@:2}"
  jq -r '"'"$1"': LCP \(.audits["largest-contentful-paint"].numericValue | round) ms, FCP \(.audits["first-contentful-paint"].numericValue | round) ms, element: \(.audits["lcp-breakdown-insight"].details.items[1].nodeLabel // "?")"' "$OUT/$1.json"
}
run zimne
sleep 5 # service worker kończy precache
run cache --disable-storage-reset
echo "Raporty: $OUT"
jq -e '.audits["largest-contentful-paint"].numericValue < 1000' "$OUT/cache.json" >/dev/null

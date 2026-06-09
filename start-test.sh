#!/usr/bin/env bash
#
# start-test.sh — démarre la boutique demo-izipay + un tunnel cloudflared,
# puis affiche l'URL webhook à coller dans le dashboard izipay.
#
# Usage :  ./start-test.sh         (démarre tout)
#          ./start-test.sh stop    (arrête tout)
#
set -euo pipefail
cd "$(dirname "$0")"

PORT=3000
WEBHOOK_PATH="/webhook"          # demo-izipay sert le webhook sur /webhook
DEV_LOG="/tmp/demo-izipay-dev.log"
CF_LOG="/tmp/demo-izipay-cf.log"

# --- arrêt ---
if [[ "${1:-}" == "stop" ]]; then
  pkill -f 'next dev' 2>/dev/null && echo "✓ next dev arrêté" || echo "· next dev déjà arrêté"
  pkill -f "cloudflared tunnel --url http://localhost:$PORT" 2>/dev/null && echo "✓ tunnel arrêté" || echo "· tunnel déjà arrêté"
  exit 0
fi

command -v cloudflared >/dev/null || { echo "✗ cloudflared introuvable (brew install cloudflared)"; exit 1; }

# --- 1. serveur Next.js ---
if lsof -i ":$PORT" >/dev/null 2>&1; then
  echo "· :$PORT déjà actif — on réutilise le serveur en cours"
else
  echo "▶ Démarrage de demo-izipay (next dev :$PORT)…"
  nohup npm run dev >"$DEV_LOG" 2>&1 &
  disown
  # attendre que le port réponde
  for _ in $(seq 1 30); do lsof -i ":$PORT" >/dev/null 2>&1 && break; sleep 1; done
  echo "  serveur lancé (logs : $DEV_LOG)"
fi

# --- 2. tunnel cloudflared ---
echo "▶ Tunnel cloudflared → :$PORT…"
pkill -f "cloudflared tunnel --url http://localhost:$PORT" 2>/dev/null || true
nohup cloudflared tunnel --url "http://localhost:$PORT" >"$CF_LOG" 2>&1 &
disown

URL=""
for _ in $(seq 1 25); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1)"
  [[ -n "$URL" ]] && break
  sleep 1
done

echo
if [[ -n "$URL" ]]; then
  echo "✅ Prêt !"
  echo "   Boutique : http://localhost:$PORT"
  echo "   Tunnel   : $URL"
  echo
  echo "   👉 URL WEBHOOK (dashboard izipay → Webhooks) :"
  echo "      $URL$WEBHOOK_PATH"
else
  echo "⚠ Tunnel pas encore prêt — voir $CF_LOG"
fi
echo
echo "Arrêt : ./start-test.sh stop"

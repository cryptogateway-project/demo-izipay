#!/usr/bin/env node
/**
 * Relais de webhooks : reçoit les livraisons (via ngrok) et les RÉ-ÉMET, à l'identique
 * (corps brut + en-têtes X-IziPay-*), vers plusieurs cibles locales.
 *
 * Utile si un seul tunnel ngrok gratuit doit servir À LA FOIS la boutique (port 3000)
 * ET le playground (port 4040). On signe une fois, on diffuse à tous.
 *
 *   node scripts/webhook-relay.mjs
 *   ngrok http 4455            # puis l'endpoint dashboard = https://<domaine>.ngrok-free.dev/webhook
 *
 * Variables :
 *   RELAY_PORT     (défaut 4455)
 *   RELAY_TARGETS  (défaut "http://localhost:3000,http://localhost:4040")
 */
import http from "node:http";

const PORT = Number(process.env.RELAY_PORT || 4455);
const TARGETS = (process.env.RELAY_TARGETS || "http://localhost:3000,http://localhost:4040")
  .split(",")
  .map((t) => t.trim().replace(/\/$/, ""))
  .filter(Boolean);

const HOP_BY_HOP = new Set(["host", "content-length", "connection", "accept-encoding"]);

function forwardHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const body = Buffer.concat(chunks);
      const headers = forwardHeaders(req.headers);
      await Promise.all(
        TARGETS.map(async (t) => {
          try {
            const r = await fetch(t + req.url, {
              method: req.method,
              headers,
              body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
            });
            console.log(`→ ${t}${req.url} ${r.status}`);
          } catch (e) {
            console.log(`→ ${t}${req.url} ERREUR ${e.message}`);
          }
        }),
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"relayed":true}');
    });
  })
  .listen(PORT, () => {
    console.log(`Relais webhook sur :${PORT}`);
    console.log(`Cibles : ${TARGETS.join(", ")}`);
    console.log(`→ lancez : ngrok http ${PORT}`);
  });

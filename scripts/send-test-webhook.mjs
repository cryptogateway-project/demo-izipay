#!/usr/bin/env node
/**
 * Forge un webhook IzichangePay SIGNÉ et l'envoie au récepteur local (/webhook),
 * pour tester la vérification de signature, l'anti-replay et l'idempotence
 * SANS effectuer un vrai paiement crypto.
 *
 * Usage :
 *   node scripts/send-test-webhook.mjs completed   <orderId>     # payment_intent.completed
 *   node scripts/send-test-webhook.mjs expired     <orderId>     # payment_intent.expired
 *   node scripts/send-test-webhook.mjs invoice.paid <invoiceId>  # invoice.paid (izipayId de la facture)
 *   node scripts/send-test-webhook.mjs tampered    <orderId>     # signature falsifiée -> 400 attendu
 *   node scripts/send-test-webhook.mjs replay       <orderId>     # timestamp trop vieux -> 400 attendu
 *
 * Variables : IZIPAY_WEBHOOK_SECRET (lue depuis .env.local), WEBHOOK_URL (défaut http://localhost:3000/webhook).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

const [, , rawKind = "completed", id = "ord_test", amountArg] = process.argv;
const amount = amountArg || "1000"; // doit correspondre au montant de la commande (sinon "montant incohérent")
const secret = process.env.IZIPAY_WEBHOOK_SECRET || "";
const url = process.env.WEBHOOK_URL || "http://localhost:3000/webhook";

if (!secret) {
  console.error("✗ IZIPAY_WEBHOOK_SECRET manquant (définissez-le dans .env.local).");
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);

function buildBody(kind, ts) {
  switch (kind) {
    case "completed":
    case "tampered":
    case "replay":
    case "mismatch":
    case "irregular":
      return {
        event: "payment_intent.completed",
        timestamp: ts,
        data: {
          intentId: `pi_${id}`,
          merchantId: "mrc_test",
          merchantReference: id,
          status: "completed",
          // 'mismatch' force un montant différent de la commande → "montant incohérent".
          amountRequested: kind === "mismatch" ? String(Number(amount) + 50000) : amount,
          currencyRequested: "XOF",
          totalAmountReceived: "5.20",
          assetCode: "TRX",
          amountNetMerchant: "5.18",
          source: "api",
          // 'irregular' simule un paiement hors plage en attente de décision.
          ...(kind === "irregular" ? { irregularStatus: "pending_decision" } : {}),
        },
      };
    case "confirming":
      return {
        event: "payment_intent.confirming",
        timestamp: ts,
        data: {
          intentId: `pi_${id}`,
          merchantReference: id,
          status: "confirming",
          totalAmountReceived: "5.20",
          assetCode: "TRX",
        },
      };
    case "expired":
      return {
        event: "payment_intent.expired",
        timestamp: ts,
        data: {
          intentId: `pi_${id}`,
          merchantReference: id,
          status: "expired",
          totalAmountReceived: "0",
        },
      };
    case "invoice.paid":
      return {
        event: "invoice.paid",
        timestamp: ts,
        data: {
          invoiceId: id,
          intentId: `pi_${id}`,
          amount: "50000",
          currency: "XOF",
          clientEmail: "client@example.com",
        },
      };
    default:
      console.error(`✗ Événement inconnu : ${kind}`);
      process.exit(1);
  }
}

// 'replay' => timestamp 10 min dans le passé (au-delà de la tolérance 300s).
const ts = rawKind === "replay" ? now - 600 : now;
const body = buildBody(rawKind, ts);
const raw = JSON.stringify(body);

let signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
if (rawKind === "tampered") {
  // Inverse le dernier caractère hex pour invalider la signature.
  const last = signature.slice(-1);
  signature = signature.slice(0, -1) + (last === "0" ? "1" : "0");
}

console.log(`→ POST ${url}`);
console.log(`  event=${body.event} kind=${rawKind} ref=${id} ts=${ts}`);

try {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-IziPay-Signature": `sha256=${signature}`,
      "X-IziPay-Timestamp": String(ts),
    },
    body: raw,
  });
  const text = await res.text();
  const expected400 = rawKind === "tampered" || rawKind === "replay";
  const ok = expected400 ? res.status === 400 : res.status === 200;
  console.log(`← HTTP ${res.status} ${text}`);
  console.log(
    ok
      ? `✓ Conforme (${expected400 ? "rejet 400 attendu" : "200 attendu"}).`
      : `✗ Inattendu (attendu ${expected400 ? "400" : "200"}).`,
  );
  process.exit(ok ? 0 : 2);
} catch (err) {
  console.error(`✗ Échec d'envoi : ${err.message}`);
  console.error("  Le serveur Next tourne-t-il sur http://localhost:3000 ?");
  process.exit(1);
}

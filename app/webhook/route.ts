import { NextResponse } from "next/server";
import { IziPayClient, IziPayWebhookError, type WebhookEvent } from "@/lib/izipay";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Récepteur de webhooks IzichangePay.
 * Servi à `/webhook` pour coller à l'URL ngrok déjà configurée.
 *
 * 1. Lit le corps BRUT (obligatoire pour la signature).
 * 2. Vérifie la signature HMAC + anti-replay → 400 si invalide.
 * 3. Dispatch idempotent vers le store.
 * 4. Acquitte vite ({ received: true }).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.IZIPAY_WEBHOOK_SECRET ?? "";

  let event: WebhookEvent;
  try {
    event = IziPayClient.validateWebhook(raw, req.headers.get("x-izipay-signature"), secret);
  } catch (e) {
    const reason = e instanceof IziPayWebhookError ? e.reason : "invalid_body";
    console.error(`[webhook] rejeté : ${reason}`);
    return NextResponse.json({ error: "invalid_webhook", reason }, { status: 400 });
  }

  // Idempotence au niveau LIVRAISON : IzichangePay peut livrer deux fois le même
  // événement (retry après timeout). On le traite une seule fois. cf. doc « Idempotence côté receveur ».
  const d0 = event.data as Record<string, unknown>;
  const resourceId =
    (typeof d0.intentId === "string" && d0.intentId) ||
    (typeof d0.paymentIntentId === "string" && d0.paymentIntentId) ||
    (typeof d0.merchantReference === "string" && d0.merchantReference) ||
    "unknown";
  const eventKey = `${event.type}:${resourceId}:${event.timestamp}`;
  if (!db.markEventProcessed(eventKey)) {
    console.log(`[webhook] doublon ignoré : ${eventKey}`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (e) {
    // On loggue mais on acquitte tout de même : la signature est valide et le store
    // est idempotent. (Renvoyer 5xx déclencherait des retries en boucle.)
    console.error("[webhook] erreur de traitement :", e);
  }

  return NextResponse.json({ received: true });
}

function handleEvent(event: WebhookEvent): void {
  const d = event.data as Record<string, unknown>;
  const ref = typeof d.merchantReference === "string" ? d.merchantReference : undefined;
  const intentId =
    (typeof d.intentId === "string" && d.intentId) ||
    (typeof d.paymentIntentId === "string" && d.paymentIntentId) ||
    undefined;
  const stored = { type: event.type, timestamp: event.timestamp, data: d };
  // Cast to string: the SDK WebhookEventType union is incomplete (e.g. payment_intent.confirming).
  const eventType = event.type as string;
  switch (eventType) {
    case "payment_intent.completed": {
      const order = db.find(ref, intentId);
      if (!order) break; // aucune commande locale correspondante → rien à livrer

      // (1) Vérification du montant : le paiement correspond-il à ce que CETTE commande attendait ?
      const mismatch = amountMismatch(order, d);
      if (mismatch) {
        console.warn(`[webhook] montant incohérent pour ${order.id} (${mismatch})`);
        db.setStatus(ref, intentId, "amount_mismatch", stored);
        break;
      }

      // (2) Paiement irrégulier (hors plage acceptée / litige) : on ne livre pas, on signale.
      if (isIrregular(d)) {
        db.setStatus(ref, intentId, "irregular", stored);
        break;
      }

      // Conforme → on marque payé (idempotent).
      db.markPaid(ref, intentId, { ...d, timestamp: event.timestamp }, event.type);
      break;
    }
    case "payment_intent.confirming":
    case "payin.detected":
    case "payin.confirmed": {
      // Paiement détecté on-chain, en cours de confirmation (setStatus ne dégrade jamais "paid").
      db.setStatus(ref, intentId, "confirming", stored);
      break;
    }
    case "payment_intent.expired": {
      db.setStatus(ref, intentId, "expired", stored);
      break;
    }
    default:
      // Autres événements (payout.*, settlement.*, invoice.*, dispute.*) : ignorés ici.
      break;
  }
}

/** Compare le montant/devise attendus (commande locale) à ceux annoncés par l'événement signé. */
function amountMismatch(
  order: { amount?: string; currency?: string },
  d: Record<string, unknown>,
): string | null {
  const got = typeof d.amountRequested === "string" ? d.amountRequested : undefined;
  const gotCur = typeof d.currencyRequested === "string" ? d.currencyRequested : undefined;
  if (order.amount != null && got != null && Number(order.amount) !== Number(got)) {
    return `montant attendu ${order.amount}, reçu ${got}`;
  }
  if (order.currency != null && gotCur != null && order.currency !== gotCur) {
    return `devise attendue ${order.currency}, reçue ${gotCur}`;
  }
  return null;
}

/** Détecte un paiement irrégulier signalé par l'API (irregularStatus ≠ none, ou status=irregular). */
function isIrregular(d: Record<string, unknown>): boolean {
  const irr = typeof d.irregularStatus === "string" ? d.irregularStatus : undefined;
  if (irr && irr !== "none") return true;
  return typeof d.status === "string" && d.status === "irregular";
}

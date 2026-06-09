import { NextResponse } from "next/server";
import { IziPayClient } from "@/lib/izipay";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Statut d'une commande (lu dans le store, mis à jour par le webhook).
 * Si l'intent est encore en attente, on RÉCONCILIE en interrogeant l'API
 * (utile pour observer le statut sans attendre la livraison du webhook).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = db.get(id);
  if (!record) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }

  let reconciledFrom: "webhook" | "api" = "webhook";

  // On réconcilie tant que la commande n'est pas dans un état terminal.
  const NON_TERMINAL = new Set([
    "pending_payment",
    "confirming",
    "waiting_address_selection",
    "pending",
    "creating",
  ]);

  if (NON_TERMINAL.has(record.status) && record.izipayId) {
    try {
      const intent = await new IziPayClient().paymentIntents.retrieve(record.izipayId);
      const mapped = mapIntentStatus(intent as unknown as Record<string, unknown>, record);
      if (mapped && mapped !== record.status) {
        db.update(record.id, { status: mapped, raw: intent });
        record.status = mapped;
        reconciledFrom = "api";
      }
    } catch {
      // Pas de clé / erreur réseau : on reste sur l'état du store.
    }
  }

  return NextResponse.json({
    id: record.id,
    status: record.status,
    amount: record.amount,
    currency: record.currency,
    paymentLink: record.paymentLink,
    izipayId: record.izipayId,
    paidAt: record.paidAt,
    eventsCount: record.events.length,
    reconciledFrom,
  });
}

/**
 * Mappe le statut d'un intent (source de vérité API) vers l'état de commande,
 * en vérifiant le montant et en signalant les paiements irréguliers.
 */
function mapIntentStatus(
  intent: Record<string, unknown>,
  record: { amount?: string; currency?: string },
): string | null {
  const s = typeof intent.status === "string" ? intent.status : "";
  const irr = typeof intent.irregularStatus === "string" ? intent.irregularStatus : "none";

  if (s === "completed") {
    const got = typeof intent.amountRequested === "string" ? intent.amountRequested : undefined;
    const gotCur =
      typeof intent.currencyRequested === "string" ? intent.currencyRequested : undefined;
    if (record.amount != null && got != null && Number(record.amount) !== Number(got)) {
      return "amount_mismatch";
    }
    if (record.currency != null && gotCur != null && record.currency !== gotCur) {
      return "amount_mismatch";
    }
    if (irr !== "none") return "irregular";
    return "paid";
  }
  if (s === "expired") return "expired";
  if (s === "irregular" || irr !== "none") return "irregular";
  return s || null;
}

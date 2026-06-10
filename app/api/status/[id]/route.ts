import { NextResponse } from "next/server";
import { IziPayClient, IziPayError } from "@/lib/izipay";
import type { PaymentIntent } from "@/lib/izipay";

export const runtime = "nodejs";

/**
 * Statut d'un paiement — interroge l'API IzichangePay directement par merchantReference.
 * Pas de base de données : le lien local ↔ IzichangePay se fait via merchantReference = orderId.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let client: IziPayClient;
  try {
    client = new IziPayClient();
  } catch (e) {
    return NextResponse.json({ error: (e as IziPayError).message }, { status: 500 });
  }

  let intent: PaymentIntent | undefined;
  try {
    if (id.startsWith("ord_")) {
      // merchantReference → list + filtre
      const page = await client.paymentIntents.list({ merchantReference: id });
      const data = (page as unknown as { data?: PaymentIntent[] }).data;
      intent = Array.isArray(data) ? data[0] : undefined;
    } else {
      // intentId IzichangePay → retrieve direct (plus fiable)
      intent = await client.paymentIntents.retrieve(id);
    }
  } catch {
    return NextResponse.json({ error: "Erreur API IzichangePay." }, { status: 502 });
  }

  if (!intent) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }

  const paymentLink =
    intent.paymentLink ?? (intent as unknown as { paymentUrl?: string }).paymentUrl ?? "";

  const irr = (intent as unknown as Record<string, unknown>).irregularStatus;
  const irregularStatus = typeof irr === "string" ? irr : "none";

  return NextResponse.json({
    id,
    intentId: intent.id,
    status: mapStatus(intent),
    irregularStatus,
    amount: intent.amountRequested,
    currency: intent.currencyRequested,
    paymentLink,
    paidAt: intent.status === "completed" ? intent.expiresAt : undefined,
    eventsCount: 0,
    reconciledFrom: "api" as const,
  });
}

// La conformité du montant (reçu dans la plage acceptée) est décidée par la
// PLATEFORME via `irregularStatus` (none · pending_decision · encashed · refunded),
// PAS par la boutique : on lit ce flag, on ne le calcule pas. Un intent `completed`
// = fonds reçus on-chain → succès. Seul un remboursement annule la vente ; un
// montant « irrégulier » non remboursé reste un paiement réussi (signalé en note).
function mapStatus(intent: PaymentIntent): string {
  const s = intent.status as string;
  const irr = (intent as unknown as Record<string, unknown>).irregularStatus;
  if (irr === "refunded") return "refunded";
  if (s === "completed") return "paid";
  if (s === "expired") return "expired";
  // confirming / pending / waiting_address_selection → exposés tels quels
  return s || "pending_payment";
}

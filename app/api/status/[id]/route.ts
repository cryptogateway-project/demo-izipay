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
    // Recherche par merchantReference (= notre ref local ord_xxx)
    const page = await client.paymentIntents.list({ merchantReference: id });
    const data = (page as unknown as { data?: PaymentIntent[] }).data;
    intent = Array.isArray(data) ? data[0] : undefined;
  } catch {
    return NextResponse.json({ error: "Erreur API IzichangePay." }, { status: 502 });
  }

  if (!intent) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }

  const paymentLink =
    intent.paymentLink ?? (intent as unknown as { paymentUrl?: string }).paymentUrl ?? "";

  return NextResponse.json({
    id,
    intentId: intent.id,
    status: mapStatus(intent),
    amount: intent.amountRequested,
    currency: intent.currencyRequested,
    paymentLink,
    paidAt: intent.status === "completed" ? intent.expiresAt : undefined,
    eventsCount: 0,
    reconciledFrom: "api" as const,
  });
}

function mapStatus(intent: PaymentIntent): string {
  const s = intent.status as string;
  const irr = (intent as unknown as Record<string, unknown>).irregularStatus;

  if (s === "completed") {
    if (typeof irr === "string" && irr !== "none") return "irregular";
    return "paid";
  }
  if (s === "expired") return "expired";
  if (s === "irregular" || (typeof irr === "string" && irr !== "none")) return "irregular";
  // confirming / pending / waiting_address_selection → on les expose tels quels
  return s || "pending_payment";
}

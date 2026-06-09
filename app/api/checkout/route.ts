import { NextResponse } from "next/server";
import { IziPayClient, IziPayApiError, IziPayError } from "@/lib/izipay";
import { IziPayClient as IziPaySdkClient } from "izichangepay-sdk";
import { resolveCart, CURRENCY, DEFAULT_ACCEPTED_COINS, type CartLine } from "@/lib/catalog";
import crypto from "node:crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let payload: { items?: CartLine[]; method?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  const { lines, total } = resolveCart(items);
  if (lines.length === 0 || total <= 0) {
    return NextResponse.json({ error: "Panier vide ou invalide." }, { status: 400 });
  }
  const amount = String(total);

  let client: IziPayClient;
  try {
    client = new IziPayClient();
  } catch (e) {
    return NextResponse.json({ error: (e as IziPayError).message }, { status: 500 });
  }

  // Cryptos acceptées : 1) IZIPAY_ACCEPTED_COINS  2) merchant-assets  3) défaut
  const envCoins = (process.env.IZIPAY_ACCEPTED_COINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let acceptedCoins = envCoins.length ? envCoins : DEFAULT_ACCEPTED_COINS;
  if (!envCoins.length) {
    try {
      const active = await client.merchantAssets.listActiveCodes();
      if (active.length) acceptedCoins = active;
    } catch {
      // scope merchants:read absent ou erreur réseau → valeurs par défaut
    }
  }

  // Identifiant local — sert de merchantReference ET de clé de la returnUrl.
  // Pas de db : on fait le lien via merchantReference côté IzichangePay.
  const ref = `ord_${crypto.randomBytes(5).toString("hex")}`;

  // process.env.URL = URL canonique auto-injectée par Netlify
  const siteUrl = process.env.SITE_URL ?? process.env.URL ?? "http://localhost:3000";

  const method: "embedded" | "hosted" | "sdk" =
    payload.method === "hosted" || payload.method === "sdk" || payload.method === "embedded"
      ? payload.method
      : process.env.CHECKOUT_MODE === "embedded"
        ? "embedded"
        : "hosted";

  const createParams = {
    requestedCurrencyType: "fiat" as const,
    currencyRequested: CURRENCY,
    amountRequested: amount,
    acceptedCoins,
    merchantReference: ref,
    returnUrl: `${siteUrl}/orders/${ref}/done`,
    metadata: { orderId: ref },
    idempotencyKey: `checkout-${ref}`,
  };

  try {
    let intentId: string;
    let paymentLink: string;
    let status: string;

    if (method === "sdk") {
      const sdk = new IziPaySdkClient({
        apiKey: process.env.IZIPAY_API_KEY ?? "",
        baseUrl: process.env.IZIPAY_API_BASE_URL,
      });
      const intent = await sdk.paymentIntents.create(createParams);
      intentId = intent.id;
      paymentLink =
        (intent as unknown as { paymentLink?: string }).paymentLink ??
        intent.paymentUrl ??
        "";
      status = intent.status;
    } else {
      const intent = await client.paymentIntents.create(createParams);
      intentId = intent.id;
      paymentLink = intent.paymentLink;
      status = intent.status || "pending_payment";
    }

    const wantsModal = method === "embedded" || method === "sdk";
    return NextResponse.json({
      orderId: ref,
      method,
      redirectUrl: paymentLink,
      ...(wantsModal ? { intentId } : {}),
      // intentId toujours disponible pour debug / status page
      intentId,
      status,
    });
  } catch (e) {
    const err = e as IziPayApiError;
    const noActiveCoin = err.statusCode === 400 && /active/i.test(err.message || "");
    if (noActiveCoin) {
      return NextResponse.json(
        {
          error: `Aucune des cryptos proposées (${acceptedCoins.join(", ")}) n'est activée sur votre compte. Activez-en une dans le dashboard, ou définissez IZIPAY_ACCEPTED_COINS dans .env.local.`,
          code: err.code,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: err.message, code: err.code, statusCode: err.statusCode },
      { status: 502 },
    );
  }
}

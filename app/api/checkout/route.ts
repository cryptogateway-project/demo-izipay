import { NextResponse } from "next/server";
import { IziPayClient, IziPayApiError, IziPayError } from "@/lib/izipay";
import { IziPayClient as IziPaySdkClient } from "izichangepay-sdk";
import { db } from "@/lib/db";
import { resolveCart, CURRENCY, DEFAULT_ACCEPTED_COINS, type CartLine } from "@/lib/catalog";

export const runtime = "nodejs";

/**
 * Reçoit le panier, RECALCULE le total côté serveur depuis le catalogue (on ne fait
 * jamais confiance au prix client), crée un PaymentIntent et renvoie l'URL du checkout
 * hébergé (paymentLink) vers laquelle rediriger le client.
 */
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

  // Cryptos acceptées au checkout. Priorité :
  //   1) IZIPAY_ACCEPTED_COINS (.env.local) — utile quand la clé n'a pas le scope merchants:read ;
  //   2) auto-détection des actifs activés sur le compte (GET /v1/merchant-assets) ;
  //   3) valeurs par défaut.
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
      // Clé sans scope merchants:read (403) ou réseau : on garde les valeurs par défaut.
    }
  }

  const order = db.createRecord({
    kind: "intent",
    status: "pending_payment",
    amount,
    currency: CURRENCY,
    label: lines.map((l) => `${l.qty}× ${l.product.name}`).join(", "),
    meta: {
      items: lines.map((l) => ({
        id: l.product.id,
        name: l.product.name,
        qty: l.qty,
        priceXof: l.product.priceXof,
      })),
    },
  });

  const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

  // Méthode d'intégration choisie au panier. Défaut : CHECKOUT_MODE (.env), sinon hébergé.
  //   embedded → modale embed.js (client maison)   hosted → redirection (client maison)
  //   sdk      → modale embed.js MAIS l'intent est créé via @izipay/node-sdk officiel.
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
    merchantReference: order.id,
    returnUrl: `${siteUrl}/orders/${order.id}/done`,
    metadata: { orderId: order.id },
    idempotencyKey: `checkout-${order.id}`,
  };

  try {
    let intentId: string;
    let paymentLink: string;
    let status: string;
    let raw: unknown;

    if (method === "sdk") {
      // Voie SDK officiel : démontre que `@izipay/node-sdk` crée le même intent.
      const sdk = new IziPaySdkClient({
        apiKey: process.env.IZIPAY_API_KEY ?? "",
        baseUrl: process.env.IZIPAY_API_BASE_URL,
      });
      const intent = await sdk.paymentIntents.create(createParams);
      intentId = intent.id;
      // L'API renvoie `paymentLink`; le SDK le type `paymentUrl` sans normalisation.
      // On accepte les deux pour être robuste à une future mise à jour de l'API.
      paymentLink =
        (intent as unknown as { paymentLink?: string }).paymentLink ??
        intent.paymentUrl ??
        "";
      status = intent.status;
      raw = intent;
    } else {
      const intent = await client.paymentIntents.create(createParams);
      intentId = intent.id;
      paymentLink = intent.paymentLink; // le client maison expose `paymentLink`
      status = intent.status || "pending_payment";
      raw = intent;
    }

    db.update(order.id, { izipayId: intentId, paymentLink, status, raw });

    // embedded & sdk → modale (on renvoie intentId) ; hosted → redirection seule.
    const wantsModal = method === "embedded" || method === "sdk";
    return NextResponse.json({
      orderId: order.id,
      method,
      redirectUrl: paymentLink,
      ...(wantsModal ? { intentId } : {}),
    });
  } catch (e) {
    const err = e as IziPayApiError;
    db.update(order.id, {
      status: "error",
      meta: { ...(order.meta ?? {}), error: err.message, code: err.code },
    });
    // Cas fréquent : aucune des cryptos demandées n'est activée sur le compte.
    const noActiveCoin = err.statusCode === 400 && /active/i.test(err.message || "");
    if (noActiveCoin) {
      return NextResponse.json(
        {
          error: `Aucune des cryptos proposées (${acceptedCoins.join(
            ", ",
          )}) n'est activée sur votre compte. Activez-en une dans le dashboard, ou définissez IZIPAY_ACCEPTED_COINS dans .env.local avec vos actifs activés.`,
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

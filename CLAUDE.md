@AGENTS.md

# Projet — IziShop (boutique de démonstration payée en crypto via IzichangePay)

Boutique e-commerce minimale (Next.js App Router) : catalogue de produits → panier → checkout
crypto hébergé par IzichangePay → confirmation par **webhook**. Appels réels au **sandbox**
(`https://api.sandbox-pay.izichange.com`). La doc API tourne en local sur `http://localhost:7008`
(spec OpenAPI live : `…/v1/openapi.json`).

> Le banc de test « dev » (explorateur d'endpoints, simulateur, monitoring) est un OUTIL SÉPARÉ de
> l'utilisateur (sur `localhost:4040`) — ce projet est uniquement la **vitrine marchande**.

## Parcours
Catalogue (`/`) → panier (`/cart`) → `POST /api/checkout` (crée le PaymentIntent) → redirection
vers `paymentLink` (checkout hébergé) → `returnUrl` `/orders/{id}/done` (poll du statut) →
`POST /webhook` valide le paiement (`payment_intent.completed`) et marque la commande payée.

## Fichiers clés
- `lib/catalog.ts` — catalogue statique (prix XOF) + `resolveCart()` (le serveur **recalcule** le
  total, ne fait jamais confiance au prix client) + `DEFAULT_ACCEPTED_COINS`.
- `lib/izipay.ts` — **seam d'intégration unique** : client REST maison (Bearer + Idempotency-Key +
  retry 429/5xx + erreurs typées) + `IziPayClient.validateWebhook()` (HMAC temps constant +
  anti-replay). Le SDK `@izipay/node-sdk` **n'existe pas encore sur npm**.
- `lib/db.ts` — store JSON `data/records.json` ; `markPaid` **idempotent**.
- `lib/money.ts` — `formatAmount()` (affichage), `toMajorUnitString()`.
- `app/_cart/CartProvider.tsx` — panier client (Context + localStorage).
- `app/api/checkout/route.ts`, `app/api/status/[id]/route.ts`, `app/webhook/route.ts` (servi à
  **`/webhook`** pour matcher ngrok ; body BRUT via `req.text()`).
- `app/page.tsx` (catalogue), `app/cart/page.tsx`, `app/orders/[id]/done/*` (confirmation).

## Conventions & pièges
- **Montants** : chaîne décimale en unité majeure (`"45000"`), jamais centimes ni number JSON.
- **Champ checkout** : l'API renvoie `paymentLink` (la doc SDK dit `paymentUrl` → alias exposé).
- **Webhook** : enveloppe `{ event, timestamp, data }` (champ `event`, pas `type`). Ne jamais
  re-stringifier le JSON avant de vérifier la signature.
- **Next 16** : Turbopack par défaut ; `params` est une `Promise` → `const { id } = await params`.
- **Sécurité** : le serveur recalcule le total depuis `lib/catalog.ts` ; clé envoyée par header,
  jamais exposée au client.

## Commandes
- `npm run dev` (port 3000) · `npm run build` · `npm run lint`
- `npm run wh <completed|expired|tampered|replay> <orderId>` — teste le récepteur `/webhook`
  (signé localement). `<orderId>` = id d'une commande créée au checkout (préfixe `ord_`).

## TODO d'intégration (voir mémoire projet)
- `TODO(embed.js Q1 2027)` — checkout embedded inline sans redirection.
- `TODO(node-sdk)` — basculer `lib/izipay.ts` sur `@izipay/node-sdk` dès publication.

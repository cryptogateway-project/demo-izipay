# IziShop — boutique de démonstration (paiement crypto via IzichangePay)

Boutique e-commerce minimale qui démontre le parcours d'achat payé en crypto :

**Catalogue → panier → checkout hébergé IzichangePay → confirmation par webhook.**

L'écran de paiement crypto (réseaux, QR code) est **hébergé par IzichangePay** (champ `paymentLink`) ;
la boutique crée le paiement côté serveur, redirige le client, puis confirme la commande à la
réception du webhook `payment_intent.completed`.

## Configuration

```bash
cp .env.local.example .env.local
# IZIPAY_API_KEY=sk_test_…   (dashboard → Développeurs → Clés API)
# IZIPAY_WEBHOOK_SECRET=whsec_…   (dashboard → Développeurs → Webhooks)
# SITE_URL=http://localhost:3000
```

## Lancer

```bash
npm run dev                 # http://localhost:3000
ngrok http 3000             # expose /webhook au sandbox (l'endpoint dashboard doit pointer sur …/webhook)
```

## Recevoir les webhooks (ngrok)

1. Le tunnel ngrok doit pointer sur **le port de la boutique (3000)** : `ngrok http 3000`.
   (Si ngrok pointe sur un autre port, ex. 4040, c'est cette autre app qui reçoit, pas la boutique.)
2. L'endpoint webhook du dashboard = `https://<votre-domaine>.ngrok-free.dev/webhook`.
3. `IZIPAY_WEBHOOK_SECRET` (.env.local) **DOIT être le secret de cet endpoint** (sinon `/webhook`
   répond 400 — visible dans Dashboard → Intégration → Webhooks → Livraisons récentes).

**Servir deux apps avec un seul tunnel** (ex. boutique 3000 + un playground 4040) :

```bash
npm run relay               # relais sur :4455 -> rediffuse vers 3000 ET 4040 (signature préservée)
ngrok http 4455             # l'endpoint dashboard pointe alors sur le relais
# cibles configurables : RELAY_TARGETS="http://localhost:3000,http://localhost:4040"
```

## Parcours

1. **Catalogue** (`/`) — grille de produits, bouton « Ajouter » au panier.
2. **Panier** (`/cart`) — quantités, total, « Payer en crypto ».
3. **Checkout** — `POST /api/checkout` recalcule le total côté serveur, crée le `PaymentIntent`
   (`POST /v1/payment-intents`) et redirige vers le `paymentLink`.
4. **Confirmation** (`/orders/<id>/done`) — la page interroge le statut ; le **webhook**
   `payment_intent.completed` marque la commande payée (mise à jour idempotente).

## Tester le webhook sans paiement réel

```bash
npm run wh completed <orderId>   # → 200, commande "Payé"
npm run wh expired   <orderId>   # → 200, commande "Expiré"
npm run wh tampered  <orderId>   # signature falsifiée → 400
npm run wh replay    <orderId>   # timestamp trop vieux → 400 (anti-replay)
```

`<orderId>` (préfixe `ord_`) provient d'une commande créée au checkout. Rejouez `completed` deux
fois pour vérifier l'**idempotence**.

## Architecture

- `lib/catalog.ts` — catalogue + calcul du total côté serveur.
- `lib/izipay.ts` — client REST IzichangePay + vérification de webhook (HMAC + anti-replay).
- `lib/db.ts` — store local des commandes (`data/records.json`).
- `app/api/checkout`, `app/webhook`, `app/api/status/[id]` — backend.
- `app/`, `app/cart`, `app/orders/[id]/done`, `app/_cart` — vitrine + panier.

## Évolutions prévues

- **Checkout embedded `embed.js`** (sans redirection) : prévu Q1 2027 — point de bascule
  `CHECKOUT_MODE=redirect|embedded` (`TODO(embed.js Q1 2027)`).
- **SDK officiel `@izipay/node-sdk`** : remplacera l'implémentation interne de `lib/izipay.ts`
  (`TODO(node-sdk)`).

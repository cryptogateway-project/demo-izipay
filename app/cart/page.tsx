"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useCart } from "../_cart/CartProvider";
import { resolveCart } from "@/lib/catalog";
import { formatAmount } from "@/lib/money";
import { alertError, buttonGhost, buttonPrimary, cn, Spinner } from "../_components/ui";

// ── Intégration embed.js : bouton officiel IziPay.Button (façon PayPal) ───────
// Le montant du panier est dynamique → on utilise le mode `createIntent` : au
// clic, le bouton appelle NOTRE backend (/api/checkout, clé secrète) qui crée
// l'intent et renvoie son publicId, puis embed.js ouvre la modale. La clé sk_
// ne quitte jamais le serveur.
type IziPaySource =
  | string
  | { id?: string; intentId?: string; publicId?: string; url?: string };

type IziPayButtonOptions = {
  createIntent?: () => Promise<IziPaySource> | IziPaySource;
  url?: string;
  intentId?: string;
  label?: string;
  loadingLabel?: string;
  shape?: "pill" | "rounded" | "soft";
  color?: "teal" | "dark" | "blue" | string;
  size?: "sm" | "normal" | "lg" | "xl";
  logo?: boolean;
  locale?: string;
  style?: string;
  className?: string;
  onSuccess?: (d: unknown) => void;
  onExpired?: () => void;
  onFailed?: () => void;
  onError?: (e: unknown) => void;
  onClose?: () => void;
  onReady?: () => void;
};

type IziPayButton = (opts: IziPayButtonOptions) => {
  render: (target: string | Element) => { element: HTMLButtonElement };
};

declare global {
  interface Window {
    IziPay?: {
      open?: (opts: Record<string, unknown>) => { close: () => void };
      Button?: IziPayButton;
      __loaded?: boolean;
    };
  }
}

// Origine qui sert embed.js + la modale (= origine du paymentLink renvoyé par
// l'API). Doit être connue AVANT le clic pour rendre le bouton au montage.
const WIDGET_ORIGIN =
  process.env.NEXT_PUBLIC_IZIPAY_WIDGET_ORIGIN ?? "https://checkout.sandbox-pay.izichange.com";

// Méthodes d'intégration testables depuis le panier. `embedded` et `sdk` rendent
// tous deux le bouton officiel (modale) — leur seule différence est le chemin
// serveur qui crée l'intent. `hosted` reste une redirection vers la page hébergée.
type PayMethod = "embedded" | "hosted" | "sdk";
const PAY_METHODS: { value: PayMethod; label: string; desc: string; hint: string }[] = [
  {
    value: "embedded",
    label: "Bouton modale",
    desc: "Bouton officiel IziPay.Button → modale, sans redirection.",
    hint: "Modale embarquée · IziPay.Button + createIntent · aucune redirection",
  },
  {
    value: "sdk",
    label: "Bouton modale (SDK Node)",
    desc: "Intent créé via le SDK Node côté serveur, puis modale.",
    hint: "Modale · intent créé par le SDK Node côté serveur · aucune redirection",
  },
  {
    value: "hosted",
    label: "Page hébergée",
    desc: "Bouton classique → redirection vers la page de paiement.",
    hint: "Redirection vers la page de paiement hébergée IzichangePay",
  },
];

type CheckoutResult = { orderId: string; intentId: string; redirectUrl: string; method: string };

function errMessage(e: unknown): string | undefined {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return undefined;
}

export default function CartPage() {
  const { lines, setQty, remove, clear } = useCart();
  const { lines: resolved, total } = resolveCart(lines);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>("embedded");
  // embed.js peut déjà être chargé si on revient sur le panier (navigation client).
  const [scriptReady, setScriptReady] = useState<boolean>(
    () => typeof window !== "undefined" && !!window.IziPay?.Button,
  );
  const [scriptError, setScriptError] = useState(false);

  const payRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef<string | null>(null);
  // Toujours lire le panier le PLUS récent au clic, sans re-rendre le bouton à
  // chaque mutation (createIntent ne s'exécute qu'au clic).
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  });

  const isModal = method === "embedded" || method === "sdk";

  // Crée l'intent côté serveur (clé secrète) et renvoie le publicId au bouton.
  async function postCheckout(m: PayMethod): Promise<CheckoutResult> {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: linesRef.current, method: m }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    // Persisté pour que /orders/[id]/done puisse retrieve() directement.
    sessionStorage.setItem(`izipay_pi_${data.orderId}`, data.intentId as string);
    return data as CheckoutResult;
  }

  // Monte le bouton officiel pour les modes modale. Re-rendu quand le mode change
  // (createIntent capture le mode) ou quand le total change (libellé du bouton).
  useEffect(() => {
    if (!isModal || !scriptReady) return;
    const host = payRef.current;
    const Button = window.IziPay?.Button;
    if (!host || !Button) return;
    host.innerHTML = ""; // re-render propre

    Button({
      label: `Payer ${formatAmount(total)}`,
      loadingLabel: "Préparation…",
      shape: "rounded",
      color: "teal",
      size: "lg",
      locale: "fr",
      style: "width:100%",
      createIntent: async () => {
        setError(null);
        const d = await postCheckout(method);
        orderRef.current = d.orderId;
        return d.intentId;
      },
      // Paiement confirmé : le widget affiche son propre écran de succès (bouton
      // « Fermer »). Le webhook signé marque la commande payée (source de vérité).
      // On vide le panier et on redirige vers /done quand la modale se ferme.
      onSuccess: () => {},
      onClose: () => {
        clear();
        if (orderRef.current) window.location.href = `/orders/${orderRef.current}/done`;
      },
      onExpired: () => setError("Paiement expiré."),
      onFailed: () => setError("Paiement échoué."),
      onError: (e) => setError(errMessage(e) ?? "Erreur du widget de paiement."),
    }).render(host);

    return () => {
      host.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal, scriptReady, method, total]);

  // Mode hébergé : bouton classique → redirection vers le paymentLink.
  async function checkoutHosted() {
    setError(null);
    setSubmitting(true);
    try {
      const d = await postCheckout("hosted");
      clear();
      window.location.href = d.redirectUrl;
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (resolved.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-12 text-center">
        <p className="text-5xl" aria-hidden>
          🛒
        </p>
        <h1 className="text-xl font-bold">Votre panier est vide</h1>
        <p className="text-sm text-[var(--muted)]">Parcourez la boutique pour ajouter des articles.</p>
        <Link href="/" className={cn(buttonPrimary, "inline-flex")}>
          Voir la boutique
        </Link>
      </div>
    );
  }

  // Repli en cas d'échec de chargement d'embed.js : on redirige via la page hébergée.
  const useHostedButton = method === "hosted" || (isModal && scriptError);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* embed.js chargé en amont : window.IziPay.Button doit exister au montage du bouton. */}
      <Script
        src={`${WIDGET_ORIGIN}/embed.js`}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onLoad={() => setScriptReady(true)}
        onError={() => setScriptError(true)}
      />

      <h1 className="text-2xl font-bold tracking-tight">Votre panier</h1>

      <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {resolved.map(({ product, qty, lineTotal }) => (
          <li key={product.id} className="flex items-center gap-4 p-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-[var(--tile)] text-2xl" aria-hidden>
              {product.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{product.name}</p>
              <p className="text-sm text-[var(--muted)]">{formatAmount(product.priceXof)} / unité</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Diminuer"
                onClick={() => setQty(product.id, qty - 1)}
                className="grid size-8 place-items-center rounded-md border border-[var(--border)] hover:bg-black/5 dark:hover:bg-white/10"
              >
                −
              </button>
              <span className="w-8 text-center tabular-nums">{qty}</span>
              <button
                type="button"
                aria-label="Augmenter"
                onClick={() => setQty(product.id, qty + 1)}
                className="grid size-8 place-items-center rounded-md border border-[var(--border)] hover:bg-black/5 dark:hover:bg-white/10"
              >
                +
              </button>
            </div>
            <div className="w-28 text-right font-semibold tabular-nums">{formatAmount(lineTotal)}</div>
            <button
              type="button"
              onClick={() => remove(product.id)}
              aria-label="Retirer"
              className="text-[var(--muted)] transition hover:text-rose-600"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <span className="text-sm text-[var(--muted)]">Total</span>
        <span className="text-2xl font-bold tabular-nums">{formatAmount(total)}</span>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="mb-3 text-sm font-medium text-[var(--muted)]">Méthode de paiement</p>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Méthode de paiement">
          {PAY_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={method === m.value}
              onClick={() => setMethod(m.value)}
              className={cn(
                "rounded-xl border p-3 text-left transition",
                method === m.value
                  ? "border-[#006565] ring-2 ring-[#006565]/30 bg-[#006565]/5"
                  : "border-[var(--border)] hover:bg-black/5 dark:hover:bg-white/10",
              )}
            >
              <span className="block text-sm font-semibold">{m.label}</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className={alertError}>
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <div className="flex-1">
          {useHostedButton ? (
            // Mode hébergé (ou repli si embed.js indisponible) : bouton classique → redirection.
            <button
              type="button"
              onClick={checkoutHosted}
              disabled={submitting}
              className={cn(buttonPrimary, "w-full")}
            >
              {submitting ? (
                <>
                  <Spinner /> Préparation du paiement…
                </>
              ) : (
                `Payer ${formatAmount(total)} en crypto →`
              )}
            </button>
          ) : scriptReady ? (
            // Modes modale : le bouton officiel IziPay.Button est monté ici par embed.js.
            <div ref={payRef} />
          ) : (
            // En attente du chargement d'embed.js.
            <button type="button" disabled className={cn(buttonPrimary, "w-full")}>
              <Spinner /> Chargement du bouton de paiement…
            </button>
          )}
          {/* Hint : mode de paiement actif. Distingue les 3 types même quand
              `embedded` et `sdk` rendent le même bouton officiel. */}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
            <span>Mode actif : {PAY_METHODS.find((m) => m.value === method)?.hint}</span>
          </p>
          {isModal && scriptError ? (
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              Modale indisponible : paiement via la page hébergée.
            </p>
          ) : null}
        </div>
        <Link href="/" className={cn(buttonGhost, "flex-1")}>
          Continuer mes achats
        </Link>
      </div>
    </div>
  );
}

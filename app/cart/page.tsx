"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "../_cart/CartProvider";
import { resolveCart } from "@/lib/catalog";
import { formatAmount } from "@/lib/money";
import { alertError, buttonGhost, buttonPrimary, cn, Spinner } from "../_components/ui";

// ── Intégration embed.js : modale de paiement, sans redirection ─────────────
type IziPayHandle = { close: () => void };
type IziPayOpen = (opts: {
  intentId: string;
  locale?: string;
  onSuccess?: (d: unknown) => void;
  onExpired?: () => void;
  onFailed?: () => void;
  onError?: (e: unknown) => void;
  onClose?: () => void;
}) => IziPayHandle;

declare global {
  interface Window {
    IziPay?: { open: IziPayOpen; __loaded?: boolean };
  }
}

/** Charge embed.js depuis l'origine du widget (dérivée du paymentLink). Idempotent. */
function loadEmbedScript(widgetOrigin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.IziPay?.open) return resolve();
    const existing = document.querySelector<HTMLScriptElement>("script[data-izipay-embed]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("embed.js")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = `${widgetOrigin}/embed.js`;
    s.async = true;
    s.dataset.izipayEmbed = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Échec du chargement de embed.js"));
    document.head.appendChild(s);
  });
}

// Méthodes d'intégration testables depuis le panier.
type PayMethod = "embedded" | "hosted" | "sdk";
const PAY_METHODS: { value: PayMethod; label: string; desc: string }[] = [
  { value: "embedded", label: "Modale (embed.js)", desc: "Overlay sur la boutique, sans redirection." },
  { value: "hosted", label: "Page hébergée", desc: "Redirection vers la page de paiement izipay." },
  { value: "sdk", label: "SDK Node (modale)", desc: "Intent créé via @izipay/node-sdk, puis modale." },
];

export default function CartPage() {
  const { lines, setQty, remove, clear } = useCart();
  const { lines: resolved, total } = resolveCart(lines);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>("embedded");

  async function checkout() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines, method }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        setSubmitting(false);
        return;
      }
      // Mode embedded → modale embed.js (data.intentId présent).
      // Sinon → redirection vers le checkout hébergé (comportement par défaut).
      if (data.intentId) {
        // Persisté en sessionStorage pour que la page /done puisse retrieve() directement
        // sans dépendre du filtre merchantReference (non fiable sur sandbox).
        sessionStorage.setItem(`izipay_pi_${data.orderId}`, data.intentId as string);
        const widgetOrigin = new URL(data.redirectUrl as string).origin;
        await loadEmbedScript(widgetOrigin);
        const open = window.IziPay?.open;
        if (!open) throw new Error("embed.js indisponible (window.IziPay absent)");
        clear();
        const done = () => {
          window.location.href = `/orders/${data.orderId}/done`;
        };
        open({
          intentId: data.intentId as string,
          locale: "fr",
          // Paiement confirmé par le widget : on NE ferme PAS la modale. Le widget
          // affiche son écran de succès (bouton « Fermer »), et le webhook marque la
          // commande payée côté serveur (source de vérité). On redirige seulement
          // quand le client ferme lui-même la modale.
          onSuccess: () => {},
          onClose: done,
          onExpired: () => {
            setError("Paiement expiré.");
            setSubmitting(false);
          },
          onFailed: () => {
            setError("Paiement échoué.");
            setSubmitting(false);
          },
          onError: () => {
            setError("Erreur du widget de paiement.");
            setSubmitting(false);
          },
        });
      } else {
        if (data.intentId) {
          sessionStorage.setItem(`izipay_pi_${data.orderId}`, data.intentId as string);
        }
        clear();
        window.location.href = data.redirectUrl;
      }
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
        <button
          type="button"
          onClick={checkout}
          disabled={submitting}
          className={cn(buttonPrimary, "flex-1")}
        >
          {submitting ? (
            <>
              <Spinner /> Préparation du paiement…
            </>
          ) : (
            `Payer ${formatAmount(total)} en crypto →`
          )}
        </button>
        <Link href="/" className={cn(buttonGhost, "flex-1")}>
          Continuer mes achats
        </Link>
      </div>
    </div>
  );
}

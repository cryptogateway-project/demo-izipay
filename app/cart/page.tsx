"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "../_cart/CartProvider";
import { resolveCart } from "@/lib/catalog";
import { formatAmount } from "@/lib/money";
import { alertError, buttonGhost, buttonPrimary, cn, Spinner } from "../_components/ui";

export default function CartPage() {
  const { lines, setQty, remove, clear } = useCart();
  const { lines: resolved, total } = resolveCart(lines);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        setSubmitting(false);
        return;
      }
      clear();
      window.location.href = data.redirectUrl;
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
              <Spinner /> Redirection vers le paiement…
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

"use client";

import { useState } from "react";
import type { Product } from "@/lib/catalog";
import { formatAmount } from "@/lib/money";
import { useCart } from "../_cart/CartProvider";
import { cn } from "./ui";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  return (
    <div className="group flex flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-sm)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:shadow-[var(--shadow-md)]">
      <div className="relative grid aspect-[5/4] place-items-center overflow-hidden bg-[var(--accent-soft)]">
        {/* halo radial discret derrière l'emoji */}
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 18%, color-mix(in oklch, var(--card) 55%, transparent), transparent 60%)",
          }}
          aria-hidden
        />
        <span
          className="relative text-6xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110"
          aria-hidden
        >
          {product.emoji}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-semibold leading-snug">{product.name}</h3>
        <p className="flex-1 text-sm leading-relaxed text-[var(--muted)]">{product.description}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-lg font-bold tabular-nums">{formatAmount(product.priceXof)}</span>
          <button
            type="button"
            onClick={() => {
              add(product.id);
              setAdded(true);
              setTimeout(() => setAdded(false), 1200);
            }}
            aria-label={`Ajouter ${product.name} au panier`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-[background-color,color,transform] duration-200 ease-out active:scale-95",
              added
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "bg-[var(--accent)] text-[var(--accent-fg)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]",
            )}
          >
            {added ? (
              <>
                <span aria-hidden>✓</span> Ajouté
              </>
            ) : (
              <>
                <span aria-hidden className="text-base leading-none">
                  +
                </span>{" "}
                Ajouter
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

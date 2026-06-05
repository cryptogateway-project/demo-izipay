"use client";

import { useState } from "react";
import type { Product } from "@/lib/catalog";
import { formatAmount } from "@/lib/money";
import { useCart } from "../_cart/CartProvider";
import { buttonPrimary, cn } from "./ui";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition hover:shadow-sm">
      <div className="grid aspect-[4/3] place-items-center bg-[var(--tile)] text-5xl" aria-hidden>
        {product.emoji}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-medium">{product.name}</h3>
        <p className="mt-1 flex-1 text-sm text-[var(--muted)]">{product.description}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="font-semibold tabular-nums">{formatAmount(product.priceXof)}</span>
          <button
            type="button"
            onClick={() => {
              add(product.id);
              setAdded(true);
              setTimeout(() => setAdded(false), 1200);
            }}
            className={cn(buttonPrimary, "px-3 py-2 text-sm")}
            aria-label={`Ajouter ${product.name} au panier`}
          >
            {added ? "Ajouté ✓" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

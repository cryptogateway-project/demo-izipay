"use client";

import Link from "next/link";
import { useCart } from "./CartProvider";
import { resolveCart } from "@/lib/catalog";
import { formatAmount } from "@/lib/money";

export function CartBar() {
  const { lines, count } = useCart();
  const { total } = resolveCart(lines);
  const visible = count > 0;

  return (
    <div
      aria-hidden={!visible}
      className={[
        "fixed bottom-0 inset-x-0 z-30 px-4 pb-5 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] pointer-events-none",
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
      ].join(" ")}
    >
      <div className="mx-auto max-w-lg">
        <Link
          href="/cart"
          tabIndex={visible ? 0 : -1}
          className="pointer-events-auto flex items-center justify-between gap-4 rounded-2xl bg-[var(--accent)] px-5 py-4 text-[var(--accent-fg)] shadow-[var(--shadow-lg)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_56px_-12px_oklch(0.52_0.088_178/0.45)]"
        >
          <div className="flex items-center gap-2.5 text-sm">
            <span className="text-base" aria-hidden>🛒</span>
            <span className="font-semibold">
              {count} article{count > 1 ? "s" : ""}
            </span>
            <span className="opacity-50 select-none">·</span>
            <span className="font-bold tabular-nums">{formatAmount(total)}</span>
          </div>
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            Voir le panier
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden
              className="opacity-80"
            >
              <path
                d="M2 7h10M8 3l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </Link>
      </div>
    </div>
  );
}

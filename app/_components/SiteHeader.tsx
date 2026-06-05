"use client";

import Link from "next/link";
import { useCart } from "../_cart/CartProvider";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const { count } = useCart();

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid size-7 place-items-center rounded-md bg-[var(--accent)] text-sm text-[var(--accent-fg)]">
            iz
          </span>
          <span>IziShop</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <Link
          href="/cart"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <span aria-hidden>🛒</span>
          <span>Panier</span>
          {count > 0 ? (
            <span className="grid min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1.5 text-xs font-semibold text-[var(--accent-fg)]">
              {count}
            </span>
          ) : null}
        </Link>
        </div>
      </div>
    </header>
  );
}

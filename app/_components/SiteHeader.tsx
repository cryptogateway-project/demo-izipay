"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "../_cart/CartProvider";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const { count } = useCart();

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="group flex items-center gap-2.5">
          <Image
            src="/izipay-icon.svg"
            alt="IzichangePay"
            width={32}
            height={32}
            className="transition-transform duration-200 ease-out group-hover:-rotate-6"
            priority
          />
          <span className="font-bold tracking-tight">IziShop</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/cart"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium shadow-[var(--shadow-sm)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
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

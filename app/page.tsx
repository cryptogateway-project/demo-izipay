import { PRODUCTS } from "@/lib/catalog";
import { ProductCard } from "./_components/ProductCard";

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="space-y-4 pt-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
          <span className="size-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
          Paiement en cryptomonnaie
        </span>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Une boutique, <span className="text-[var(--accent)]">payée en crypto</span>
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">
          Ajoutez des articles, réglez en TRX ou USDT. Le paiement est confirmé automatiquement,
          sans intermédiaire ni carte bancaire.
        </p>
      </section>

      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Catalogue
          </h2>
          <span className="text-xs tabular-nums text-[var(--muted)]">{PRODUCTS.length} articles</span>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}

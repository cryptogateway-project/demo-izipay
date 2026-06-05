import { PRODUCTS } from "@/lib/catalog";
import { ProductCard } from "./_components/ProductCard";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Notre boutique</h1>
        <p className="max-w-2xl text-[var(--muted)]">
          Ajoutez des articles au panier et payez en cryptomonnaie. Le règlement est confirmé
          automatiquement après le paiement.
        </p>
      </section>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTS.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
    </div>
  );
}

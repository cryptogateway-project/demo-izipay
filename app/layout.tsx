import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "./_components/SiteHeader";
import { CartProvider } from "./_cart/CartProvider";
import { CartBar } from "./_cart/CartBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IziShop — boutique de démonstration",
  description: "Boutique de démonstration payée en crypto via IzichangePay.",
};

const isSandbox = (process.env.IZIPAY_API_BASE_URL ?? "").includes("sandbox");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='izishop.theme';var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
        <CartProvider>
          {isSandbox && (
            <div className="flex items-center justify-center gap-3 bg-[#1a2e5a] px-4 py-2 text-xs text-white/90">
              <span className="rounded bg-white/20 px-1.5 py-0.5 font-bold tracking-widest text-white">
                SANDBOX
              </span>
              <span>
                Environnement de test — utilisez le <strong>testnet</strong>, aucune cryptomonnaie réelle n&apos;est mouvementée.
              </span>
            </div>
          )}
          <SiteHeader />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-24">{children}</main>
          <CartBar />
          <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--muted)]">
            IziShop — paiement en crypto propulsé par IzichangePay.
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}

/**
 * Catalogue de la boutique (données statiques de démonstration).
 * Les prix sont en XOF (unité majeure), volontairement bas pour rester payables
 * avec un petit solde de testnet. Le serveur RECALCULE toujours le total depuis
 * ce catalogue — on ne fait jamais confiance au prix envoyé par le client.
 */
export interface Product {
  id: string;
  name: string;
  description: string;
  priceXof: number;
  emoji: string;
}

export const CURRENCY = "XOF";

/**
 * Cryptos acceptées au checkout (le client choisit le réseau sur la page hébergée).
 * DOIT correspondre à des actifs ACTIVÉS sur le compte marchand (ici : TRX).
 * Surchargeable sans recompiler via IZIPAY_ACCEPTED_COINS dans .env.local.
 */
export const DEFAULT_ACCEPTED_COINS = ["TRX"];

export const PRODUCTS: Product[] = [
  {
    id: "casque-audio",
    name: "Casque audio sans fil",
    description: "Réduction de bruit active, 30 h d'autonomie.",
    priceXof: 2500,
    emoji: "🎧",
  },
  {
    id: "montre-connectee",
    name: "Montre connectée",
    description: "Suivi d'activité, notifications, GPS intégré.",
    priceXof: 3000,
    emoji: "⌚",
  },
  {
    id: "sac-a-dos",
    name: "Sac à dos urbain",
    description: "Compartiment laptop 15\", résistant à l'eau.",
    priceXof: 2000,
    emoji: "🎒",
  },
  {
    id: "enceinte-bluetooth",
    name: "Enceinte Bluetooth",
    description: "Son 360°, étanche IPX7, 12 h de lecture.",
    priceXof: 1800,
    emoji: "🔊",
  },
  {
    id: "clavier-mecanique",
    name: "Clavier mécanique",
    description: "Switches tactiles, rétroéclairage RGB.",
    priceXof: 2200,
    emoji: "⌨️",
  },
  {
    id: "cafe-specialite",
    name: "Café de spécialité — 1 kg",
    description: "Grains arabica torréfiés artisanalement.",
    priceXof: 1200,
    emoji: "☕",
  },
  {
    id: "lampe-bureau",
    name: "Lampe de bureau LED",
    description: "Intensité réglable, port USB de charge.",
    priceXof: 1500,
    emoji: "💡",
  },
  {
    id: "tshirt-coton-bio",
    name: "T-shirt coton bio",
    description: "Coupe unisexe, coton 100 % biologique.",
    priceXof: 1000,
    emoji: "👕",
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export interface CartLine {
  id: string;
  qty: number;
}

export interface ResolvedLine {
  product: Product;
  qty: number;
  lineTotal: number;
}

/** Résout des lignes de panier en produits réels + total, en ignorant les ids inconnus. */
export function resolveCart(lines: CartLine[]): { lines: ResolvedLine[]; total: number } {
  const resolved: ResolvedLine[] = [];
  for (const line of lines) {
    const product = getProduct(line.id);
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    if (!product || qty <= 0) continue;
    resolved.push({ product, qty, lineTotal: product.priceXof * qty });
  }
  const total = resolved.reduce((sum, l) => sum + l.lineTotal, 0);
  return { lines: resolved, total };
}

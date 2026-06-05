/**
 * IzichangePay attend `amountRequested` comme une CHAÎNE décimale en unité majeure
 * (ex. "5000" = 5000 XOF), jamais des centimes ni un number JSON. cf. doc « Montants et précision ».
 */
export function toMajorUnitString(input: string | number): string {
  const s = String(input).trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error("Montant invalide : utilisez un nombre positif (ex. 25000).");
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Le montant doit être strictement positif.");
  }
  // Normalise : retire les zéros de tête superflus, conserve la valeur décimale.
  return s.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function formatAmount(amount: string | number, currency = "XOF"): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  return `${new Intl.NumberFormat("fr-FR").format(n)} ${currency}`;
}

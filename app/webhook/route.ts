/**
 * Endpoint webhook IzichangePay — stub minimal.
 * La confirmation de paiement se fait par polling API (GET /api/status/:id).
 * Ce endpoint existe pour éviter des erreurs 404 si un webhook est configuré dans le dashboard.
 */
export async function POST() {
  return Response.json({ received: true });
}

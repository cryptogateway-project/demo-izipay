import { OrderStatus } from "./OrderStatus";

export default async function OrderDonePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-lg">
      <OrderStatus id={id} />
    </div>
  );
}

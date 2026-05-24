import { ProductFormClient } from "../../product-form-client";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ProductFormClient productId={id} />;
}

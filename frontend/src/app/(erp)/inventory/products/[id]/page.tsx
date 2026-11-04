import { ProductDetailsView } from "@/components/inventory/ProductDetailsView";
export default async function ProductDetailsPage({params, searchParams}: {params: Promise<{id: string}>; searchParams: Promise<{tab?:string}>}) {
  const {id} = await params;
  const {tab} = await searchParams;
  return <ProductDetailsView key={`${id}:${tab||"overview"}`} id={id} initialTab={tab === "history" ? "history" : "overview"} />;
}

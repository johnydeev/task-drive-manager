import { TareaDetalle } from "@/components/tareas/TareaDetalle";

export default async function TareaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TareaDetalle rowId={decodeURIComponent(id)} />;
}

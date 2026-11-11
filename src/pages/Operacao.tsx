import PipelineBoard from "@/components/PipelineBoard";

export default function Operacao() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Onboarding e execução</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Organize onboarding e execução com pipelines próprias para cada fluxo.
        </p>
      </div>
      <PipelineBoard area="operacao" />
    </div>
  );
}

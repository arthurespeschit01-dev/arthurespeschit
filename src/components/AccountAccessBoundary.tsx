import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLoginAccess } from "@/hooks/useLoginAccess";
import { Button } from "@/components/ui/button";
export default function AccountAccessBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = useLoginAccess(),
    location = useLocation(),
    { signOut } = useAuth();
  if (access.isPending)
    return (
      <p role="status" className="p-8">
        Verificando seu acesso…
      </p>
    );
  if (access.error)
    return (
      <div className="p-8 space-y-3">
        <p role="alert">Não foi possível verificar seu acesso.</p>
        <Button onClick={() => void access.refetch()}>Tentar novamente</Button>
        <Button onClick={() => void signOut()}>Sair</Button>
      </div>
    );
  if (access.data.central_allowed) return <>{children}</>;
  const match = location.pathname.match(/^\/(subcontas|conta)\/([^/]+)/);
  if (
    match &&
    access.data.workspaces.some(
      (w) =>
        w.id === match[2] &&
        (w.account_kind === "agency" ? "conta" : "subcontas") === match[1],
    )
  )
    return <>{children}</>;
  const first = access.data.workspaces[0];
  const target = first
    ? `/${first.account_kind === "agency" ? "conta" : "subcontas"}/${first.id}`
    : access.data.invitation_path;
  if (target) return <Navigate to={target} replace />;
  return (
    <div className="p-8 space-y-3">
      <h1 className="text-xl font-semibold">Nenhuma subconta disponível</h1>
      <p>
        Solicite ao responsável um convite válido para acessar sua subconta.
      </p>
      <Button onClick={() => void signOut()}>Sair</Button>
    </div>
  );
}

export const CLIENT_STATUSES = ["Ativo", "Pausado", "Encerrado"] as const;
export type ClientStatusFilter = (typeof CLIENT_STATUSES)[number] | "Todos";

// Unknown or missing status must never silently reactivate an account.
export function isActiveClient(client: { status?: string | null }): boolean {
  return client.status?.trim().toLowerCase() === "ativo";
}

export function matchesClientStatus(
  client: { status?: string | null },
  filter: ClientStatusFilter,
) {
  return (
    filter === "Todos" ||
    client.status?.trim().toLowerCase() === filter.toLowerCase()
  );
}

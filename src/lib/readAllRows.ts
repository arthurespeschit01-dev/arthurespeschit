// Supabase caps individual responses. Keep board counts and history complete.
export async function readAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const data: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) return { data: [] as T[], error: result.error };
    data.push(...(result.data || []));
    if (!result.data || result.data.length < pageSize)
      return { data, error: null };
  }
}

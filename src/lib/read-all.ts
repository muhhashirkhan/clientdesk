// Range requests prevent Supabase's row cap from silently truncating related data.
export async function readAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{data: T[] | null; error: {message: string} | null}>,
  pageSize = 500,
): Promise<{data: T[]; error: {message: string} | null}> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Invalid page size.");
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await page(from, from + pageSize - 1);
    if (result.error) return {data: [], error: result.error};
    const data = result.data ?? [];
    rows.push(...data);
    if (data.length < pageSize) return {data: rows, error: null};
  }
}

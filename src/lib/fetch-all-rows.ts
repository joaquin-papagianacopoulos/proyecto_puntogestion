// Supabase corta cualquier select a 1000 filas por defecto. Con un catalogo
// de productos grande (miles de filas) eso trunca listados enteros sin
// avisar. Este helper pagina con .range() hasta traer todo.
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

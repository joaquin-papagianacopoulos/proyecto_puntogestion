const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatCurrency(cents: number) {
  return currencyFormatter.format(cents / 100);
}

export function formatDate(input: string) {
  // Fecha sin hora (ej. order_date, "2026-07-23"): se formatea a mano en
  // vez de con Date(), porque new Date("YYYY-MM-DD") se interpreta como
  // medianoche UTC — si esto corre en el navegador (zona horaria local,
  // ej. Argentina UTC-3) el dia se corre para atras. Un timestamp completo
  // (con hora y zona) si es seguro pasarlo por Date/Intl normalmente.
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}/${month}/${year}`;
  }
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(input),
  );
}

export function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

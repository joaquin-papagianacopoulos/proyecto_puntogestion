export const CAPABILITIES = {
  VIEW_OWN_STATS: "view_own_stats",
  VIEW_ALL_ORDERS: "view_all_orders",
  EDIT_OWN_ORDERS: "edit_own_orders",
} as const;

export type CapabilityKey = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  [CAPABILITIES.VIEW_OWN_STATS]: "Ver sus propias estadisticas",
  [CAPABILITIES.VIEW_ALL_ORDERS]: "Ver todos los pedidos de la empresa",
  [CAPABILITIES.EDIT_OWN_ORDERS]: "Editar pedidos ya cargados",
};

export function hasCapability(granted: string[] | null | undefined, key: CapabilityKey) {
  return Boolean(granted?.includes(key));
}

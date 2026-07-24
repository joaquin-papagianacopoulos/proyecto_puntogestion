"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Gauge,
  HandCoins,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PlusCircle,
  ReceiptText,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Warehouse,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { signOutAction } from "@/app/(auth)/login/actions";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import type { MemberRole } from "@/types/database";

export function AppShell({
  children,
  organizationName,
  role,
  isPlatformAdmin,
  permissions,
}: {
  children: ReactNode;
  organizationName: string;
  role: MemberRole | null;
  isPlatformAdmin: boolean;
  permissions: string[];
}) {
  // role es null para un platform admin sin distribuidora propia: no tiene
  // nada de la seccion "de organizacion" para ver, solo Clientes.
  const hasOrg = role !== null;
  const isOrgManager = role === "owner" || role === "admin";
  const canViewOwnStats = isOrgManager || hasCapability(permissions, CAPABILITIES.VIEW_OWN_STATS);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const navItems = [
    { href: "/", label: "Inicio", icon: LayoutDashboard, show: hasOrg },
    { href: "/pedidos/nuevo", label: "Crear pedido", icon: PlusCircle, show: hasOrg },
    { href: "/pedidos", label: "Pedidos", icon: ReceiptText, show: hasOrg },
    { href: "/estadisticas", label: "Estadisticas", icon: BarChart3, show: canViewOwnStats },
    { href: "/facturacion", label: "Facturar", icon: Wallet, show: isOrgManager },
    { href: "/modificaciones", label: "Modificaciones", icon: History, show: isOrgManager },
    { href: "/productos", label: "Productos", icon: Package, show: isOrgManager },
    { href: "/control-stock", label: "Control de stock", icon: Gauge, show: isOrgManager },
    { href: "/deudas", label: "Deudas", icon: HandCoins, show: isOrgManager },
    { href: "/equipo", label: "Equipo", icon: Users, show: isOrgManager },
    { href: "/repartidores", label: "Repartidores", icon: Truck, show: isOrgManager },
    { href: "/configuracion", label: "Configuracion", icon: Settings, show: isOrgManager },
  ];

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex items-center justify-between border-b border-line bg-white/80 px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu"
          className="grid h-10 w-10 place-items-center rounded border border-line"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <Warehouse className="h-5 w-5 text-brand" aria-hidden />
          PuntoGestion
        </Link>
        <span className="w-10" />
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} />
      ) : null}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-64 -translate-x-full border-r border-line bg-white px-4 py-5 transition-transform duration-200 lg:translate-x-0 lg:bg-white/80",
          menuOpen && "translate-x-0",
        )}
      >
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold">
            <Warehouse className="h-6 w-6 text-brand" aria-hidden />
            PuntoGestion
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menu"
            className="grid h-9 w-9 place-items-center rounded hover:bg-paper lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="mt-6 rounded border border-line bg-paper p-3">
          <p className="text-sm font-semibold">{organizationName}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-neutral-600">{role ?? "Platform admin"}</p>
        </div>
        <nav className="mt-6 space-y-1">
          {navItems
            .filter((item) => item.show)
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-10 items-center gap-3 rounded px-3 text-sm font-medium text-neutral-700 hover:bg-paper hover:text-ink"
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            ))}
          {isPlatformAdmin ? (
            <Link
              href="/admin/clientes"
              className="flex min-h-10 items-center gap-3 rounded px-3 text-sm font-medium text-neutral-700 hover:bg-paper hover:text-ink"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Clientes
            </Link>
          ) : null}
        </nav>
        <div className="absolute bottom-5 left-4 right-4">
          <form action={signOutAction}>
            <button className="flex min-h-10 w-full items-center gap-3 rounded border border-line px-3 text-sm font-medium hover:bg-paper">
              <LogOut className="h-4 w-4" aria-hidden />
              Salir
            </button>
          </form>
        </div>
      </aside>
      <main className="lg:pl-64">
        <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

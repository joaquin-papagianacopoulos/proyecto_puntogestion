export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MemberRole = "owner" | "admin" | "vendedor";
export type OrderStatus = "pendiente" | "facturado";
export type DebtDirection = "nos_deben" | "debemos";

export type OrderItemInput = { product_id: string; quantity: number };

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          business_type: string | null;
          plan: string;
          enabled_features: string[];
          is_active: boolean;
          stock_threshold_low: number;
          stock_threshold_high: number;
          created_at: string;
        };
        Insert: {
          name: string;
          slug: string;
          business_type?: string | null;
          plan?: string;
          enabled_features?: string[];
          is_active?: boolean;
          stock_threshold_low?: number;
          stock_threshold_high?: number;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      platform_admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string };
        Update: Partial<Database["public"]["Tables"]["platform_admins"]["Insert"]>;
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: MemberRole;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role: MemberRole;
        };
        Update: Partial<Database["public"]["Tables"]["memberships"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      capability_definitions: {
        Row: { key: string; label: string; description: string | null; created_at: string };
        Insert: { key: string; label: string; description?: string | null };
        Update: Partial<Database["public"]["Tables"]["capability_definitions"]["Insert"]>;
        Relationships: [];
      };
      membership_permissions: {
        Row: {
          membership_id: string;
          capability_key: string;
          granted_by: string;
          granted_at: string;
        };
        Insert: {
          membership_id: string;
          capability_key: string;
          granted_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["membership_permissions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "membership_permissions_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      drivers: {
        Row: {
          id: string;
          organization_id: string;
          full_name: string;
          phone: string | null;
          is_available: boolean;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          full_name: string;
          phone?: string | null;
          is_available?: boolean;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["drivers"]["Insert"]>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          sku: string | null;
          price_cents: number;
          cost_cents: number | null;
          unit: string | null;
          category: string | null;
          is_active: boolean;
          in_stock: boolean;
          stock_quantity: number | null;
          low_stock_threshold: number | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          name: string;
          sku?: string | null;
          price_cents: number;
          cost_cents?: number | null;
          unit?: string | null;
          category?: string | null;
          is_active?: boolean;
          in_stock?: boolean;
          stock_quantity?: number | null;
          low_stock_threshold?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          address: string | null;
          phone: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          name: string;
          address?: string | null;
          phone?: string | null;
          notes?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: number;
          organization_id: string;
          client_id: string;
          vendedor_membership_id: string;
          driver_id: string | null;
          status: OrderStatus;
          total_cents: number;
          order_date: string;
          note: string | null;
          show_note_on_invoice: boolean;
          created_at: string;
          updated_at: string;
          invoiced_at: string | null;
        };
        Insert: {
          organization_id: string;
          client_id: string;
          vendedor_membership_id: string;
          driver_id?: string | null;
          status?: OrderStatus;
          total_cents?: number;
          order_date?: string;
          note?: string | null;
          show_note_on_invoice?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price_cents: number;
          subtotal_cents: number;
        };
        Insert: {
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price_cents: number;
          subtotal_cents: number;
        };
        Update: Partial<Database["public"]["Tables"]["order_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      debts: {
        Row: {
          id: string;
          organization_id: string;
          direction: DebtDirection;
          client_id: string | null;
          counterparty_name: string | null;
          description: string | null;
          amount_cents: number;
          due_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          direction: DebtDirection;
          client_id?: string | null;
          counterparty_name?: string | null;
          description?: string | null;
          amount_cents: number;
          due_date?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["debts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "debts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      order_edits: {
        Row: {
          id: string;
          organization_id: string;
          order_id: string;
          edited_by: string;
          summary: string;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          order_id: string;
          edited_by: string;
          summary: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_edits"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "order_edits_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      debt_photos: {
        Row: {
          id: string;
          debt_id: string;
          storage_path: string;
          created_at: string;
        };
        Insert: {
          debt_id: string;
          storage_path: string;
        };
        Update: Partial<Database["public"]["Tables"]["debt_photos"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "debt_photos_debt_id_fkey";
            columns: ["debt_id"];
            isOneToOne: false;
            referencedRelation: "debts";
            referencedColumns: ["id"];
          },
        ];
      };
      debt_payments: {
        Row: {
          id: string;
          debt_id: string;
          amount_cents: number;
          paid_date: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          debt_id: string;
          amount_cents: number;
          paid_date: string;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["debt_payments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "debt_payments_debt_id_fkey";
            columns: ["debt_id"];
            isOneToOne: false;
            referencedRelation: "debts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      add_vendedor: {
        Args: { p_organization_id: string; p_user_id: string };
        Returns: string;
      };
      add_admin: {
        Args: { p_organization_id: string; p_user_id: string };
        Returns: string;
      };
      remove_membership: {
        Args: { p_organization_id: string; p_membership_id: string };
        Returns: void;
      };
      grant_permission: {
        Args: { p_organization_id: string; p_membership_id: string; p_capability_key: string };
        Returns: void;
      };
      revoke_permission: {
        Args: { p_organization_id: string; p_membership_id: string; p_capability_key: string };
        Returns: void;
      };
      create_order: {
        Args: {
          p_organization_id: string;
          p_client_id: string;
          p_items: Json;
          p_note?: string | null;
          p_show_note_on_invoice?: boolean;
        };
        Returns: string;
      };
      update_order: {
        Args: {
          p_organization_id: string;
          p_order_id: string;
          p_client_id: string;
          p_order_date: string;
          p_items: Json;
          p_sync_price_product_ids?: string[];
          p_note?: string | null;
          p_show_note_on_invoice?: boolean;
        };
        Returns: void;
      };
      mark_order_invoiced: {
        Args: { p_organization_id: string; p_order_id: string };
        Returns: void;
      };
      sync_order_item_prices: {
        Args: { p_organization_id: string; p_order_id: string };
        Returns: void;
      };
      revert_order_to_pending: {
        Args: { p_organization_id: string; p_order_id: string };
        Returns: void;
      };
      assign_driver_to_orders: {
        Args: { p_organization_id: string; p_order_ids: string[]; p_driver_id: string | null };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
  };
};

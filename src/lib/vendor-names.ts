import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDisplayName } from "@/lib/display-name";

export async function getVendorDisplayNames(organizationId: string): Promise<Map<string, string>> {
  const adminClient = createSupabaseAdminClient();
  const { data: memberships } = await adminClient
    .from("memberships")
    .select("id, user_id")
    .eq("organization_id", organizationId);

  const map = new Map<string, string>();
  for (const membership of memberships ?? []) {
    const { data } = await adminClient.auth.admin.getUserById(membership.user_id);
    map.set(membership.id, getDisplayName(data.user));
  }
  return map;
}

export async function getUserDisplayNames(userIds: string[]): Promise<Map<string, string>> {
  const adminClient = createSupabaseAdminClient();
  const map = new Map<string, string>();
  for (const userId of new Set(userIds)) {
    const { data } = await adminClient.auth.admin.getUserById(userId);
    map.set(userId, getDisplayName(data.user));
  }
  return map;
}

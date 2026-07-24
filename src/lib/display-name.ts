type NamedUser = {
  email?: string | null;
  user_metadata?: { full_name?: string | null } | null;
};

export function getDisplayName(user: NamedUser | null | undefined) {
  return user?.user_metadata?.full_name?.trim() || user?.email || "(sin nombre)";
}

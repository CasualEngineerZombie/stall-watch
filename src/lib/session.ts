import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Membership, OrgType, Role } from "@/lib/types";

type MembershipJoinRow = {
  org_id: string;
  role: Role;
  orgs:
    | { name: string; org_type: OrgType }
    | { name: string; org_type: OrgType }[]
    | null;
};

/**
 * The signed-in user and their org memberships.
 *
 * Cached per request so the layout and the page share one auth call. A signed-in user
 * with no membership is a valid state: they see an empty app, not an error.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      memberships: [] as Membership[],
      isStaff: false,
      orgLabel: "",
    };
  }

  const { data } = await supabase
    .from("memberships")
    .select("org_id, role, orgs(name, org_type)")
    .eq("user_id", user.id);

  const memberships: Membership[] = ((data ?? []) as unknown as MembershipJoinRow[]).flatMap(
    (row) => {
      const org = Array.isArray(row.orgs) ? row.orgs[0] : row.orgs;
      if (!org) return [];
      return [
        {
          org_id: row.org_id,
          role: row.role,
          org_name: org.name,
          org_type: org.org_type,
        },
      ];
    },
  );

  return {
    supabase,
    user,
    memberships,
    isStaff: memberships.some((membership) => membership.org_type === "staff"),
    orgLabel: memberships.map((membership) => membership.org_name).join(" · "),
  };
});

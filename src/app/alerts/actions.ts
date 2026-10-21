"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/alerts?error=${encodeURIComponent(message)}`);
}

export async function markRead(alertId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { error } = await supabase
    .schema("builder")
    .from("alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("id", alertId)
    .is("read_at", null);

  if (error) fail(`Could not mark the alert as read: ${error.message}`);

  revalidatePath("/alerts");
}

export async function markAllRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // No user filter here: the RLS update policy only sees the caller's own alerts.
  const { error } = await supabase
    .schema("builder")
    .from("alerts")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) fail(`Could not mark alerts as read: ${error.message}`);

  revalidatePath("/alerts");
}

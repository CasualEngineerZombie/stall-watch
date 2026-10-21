"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff-only. The RPC re-checks private.is_staff() in the database; this action only
 * makes the error readable in the UI. A builder invoking it directly gets 42501.
 */
export async function runDetectorNow() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase
    .schema("builder")
    .rpc("run_stall_detector_now");

  if (error) {
    redirect(`/detector?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/detector");
  revalidatePath("/projects");
  revalidatePath("/alerts");

  redirect(`/detector?ran=${encodeURIComponent(String(data ?? "1"))}`);
}

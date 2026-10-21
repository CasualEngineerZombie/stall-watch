"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MAX_PRODUCT_LENGTH = 120;

function backTo(
  projectId: string,
  params: { error?: string; saved?: string },
): never {
  const search = new URLSearchParams();
  if (params.error) search.set("error", params.error);
  if (params.saved) search.set("saved", params.saved);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  redirect(`/projects/${projectId}${suffix}`);
}

/**
 * Set or change a selection.
 *
 * The org id comes from the slot row the database lets this user see — never from the
 * form or the action arguments. The policy also requires selected_by = auth.uid(), so a
 * caller cannot write on someone else's behalf. The history trigger derives actor_kind.
 */
export async function setSelection(
  projectId: string,
  slotId: string,
  formData: FormData,
) {
  const productName = String(formData.get("product_name") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (!productName) {
    backTo(projectId, { error: "A product name is required." });
  }
  if (productName.length > MAX_PRODUCT_LENGTH) {
    backTo(projectId, {
      error: `Product names are limited to ${MAX_PRODUCT_LENGTH} characters.`,
    });
  }

  const { data: project } = await supabase
    .schema("builder")
    .from("v_project_status")
    .select("id, archived_at")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) redirect("/projects");
  if (project.archived_at) {
    backTo(projectId, { error: "This project is archived and read-only." });
  }

  const { data: slot } = await supabase
    .schema("builder")
    .from("project_slots")
    .select("id, org_id, project_id")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot || slot.project_id !== projectId) {
    backTo(projectId, { error: "That slot does not belong to this project." });
  }

  const { error } = await supabase
    .schema("builder")
    .from("selections")
    .upsert(
      {
        org_id: slot.org_id,
        slot_id: slot.id,
        product_name: productName,
        selected_by: user.id,
      },
      { onConflict: "slot_id" },
    );

  if (error) {
    backTo(projectId, { error: `Could not save the selection: ${error.message}` });
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  backTo(projectId, { saved: "Selection saved." });
}

export async function clearSelection(projectId: string, slotId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: project } = await supabase
    .schema("builder")
    .from("v_project_status")
    .select("id, archived_at")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) redirect("/projects");
  if (project.archived_at) {
    backTo(projectId, { error: "This project is archived and read-only." });
  }

  const { data: slot } = await supabase
    .schema("builder")
    .from("project_slots")
    .select("id, project_id")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot || slot.project_id !== projectId) {
    backTo(projectId, { error: "That slot does not belong to this project." });
  }

  const { error } = await supabase
    .schema("builder")
    .from("selections")
    .delete()
    .eq("slot_id", slot.id);

  if (error) {
    backTo(projectId, {
      error: `Could not clear the selection: ${error.message}`,
    });
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  backTo(projectId, { saved: "Selection cleared." });
}

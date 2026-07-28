"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAccessRequest, reviewAccessRequest, revokeGrant } from "@/lib/api";

export type FormState = { error?: string } | null;

/**
 * Dépose une demande d'accès.
 *
 * Aucune validation n'est refaite ici : l'API est la seule à décider, et
 * elle renvoie un message exploitable. Dupliquer les règles dans le
 * frontend créerait deux vérités qui finiraient par diverger.
 */
export async function submitAccessRequest(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const roleName = String(formData.get("roleName") ?? "");
  const justification = String(formData.get("justification") ?? "");

  const result = await createAccessRequest(roleName, justification);

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath("/my-requests");
  revalidatePath("/");
  redirect("/my-requests");
}

/** Approuve ou refuse une demande, depuis la file du manager. */
export async function reviewRequest(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "");

  if (decision !== "approve" && decision !== "reject") return;

  await reviewAccessRequest(id, decision, comment);

  revalidatePath("/manager/requests");
  revalidatePath("/manager/audit-logs");
  revalidatePath("/my-requests");
}

/** Révoque un accès accordé, depuis l'écran des accès. */
export async function revokeGrantAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");

  await revokeGrant(id, reason);

  revalidatePath("/manager/grants");
  revalidatePath("/manager/audit-logs");
  revalidatePath("/my-access");
  revalidatePath("/");
}

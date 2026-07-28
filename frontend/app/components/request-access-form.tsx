"use client";

import { useActionState } from "react";

import { submitAccessRequest, type FormState } from "@/app/actions/access";
import { SubmitButton } from "@/app/components/submit-button";
import { PRIMARY_BUTTON } from "@/lib/ui";

type Props = {
  roles: { name: string; description: string | null }[];
  /** Rôles déjà détenus : inutile de les proposer. */
  heldRoles: string[];
};

export function RequestAccessForm({ roles, heldRoles }: Props) {
  const [state, action] = useActionState<FormState, FormData>(
    submitAccessRequest,
    null,
  );

  const available = roles.filter((role) => !heldRoles.includes(role.name));

  if (available.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
        Vous disposez déjà de tous les rôles du lab. Il n&apos;y a rien à
        demander.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="roleName" className="block text-sm font-medium">
          Rôle demandé
        </label>
        <select
          id="roleName"
          name="roleName"
          required
          defaultValue={available[0]?.name}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        >
          {available.map((role) => (
            <option key={role.name} value={role.name}>
              {role.name}
              {role.description ? ` — ${role.description}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="justification" className="block text-sm font-medium">
          Justification
        </label>
        <textarea
          id="justification"
          name="justification"
          required
          minLength={10}
          maxLength={1000}
          rows={4}
          placeholder="Pourquoi cet accès est-il nécessaire à votre travail ?"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted">
          10 caractères minimum. Elle sera lue par le manager et conservée dans
          le journal d&apos;audit : c&apos;est elle qui explique pourquoi
          l&apos;accès a été accordé.
        </p>
      </div>

      {state?.error && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          {state.error}
        </div>
      )}

      <SubmitButton pendingLabel="Envoi…" className={PRIMARY_BUTTON}>
        Envoyer la demande
      </SubmitButton>
    </form>
  );
}

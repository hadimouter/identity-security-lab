import { unauthorized } from "next/navigation";

import { auth } from "@/auth";
import { RequestAccessForm } from "@/app/components/request-access-form";
import { fetchMe, fetchRoles } from "@/lib/api";

export default async function RequestAccessPage() {
  const session = await auth();
  if (!session) unauthorized();

  const [roles, me] = await Promise.all([fetchRoles(), fetchMe()]);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Demander un accès
        </h1>
        <p className="text-muted">
          Un accès ne s&apos;obtient pas par défaut : il se demande, se
          justifie, et doit être approuvé par un manager.
        </p>
      </div>

      {roles.ok ? (
        <RequestAccessForm
          roles={roles.data.roles}
          heldRoles={me.ok ? me.data.roles.all : session.roles}
        />
      ) : (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
          <p className="font-medium">Impossible de charger les rôles</p>
          <p className="mt-1 text-muted">{roles.message}</p>
        </div>
      )}
    </div>
  );
}

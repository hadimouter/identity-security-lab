"use server";

import { signIn, signOut } from "@/auth";

/**
 * Démarre le flux OIDC : redirection vers Keycloak.
 */
export async function login() {
  await signIn("keycloak", { redirectTo: "/profile" });
}

/**
 * Détruit la session locale, puis la session Keycloak
 * via l'événement signOut défini dans auth.ts.
 */
export async function logout() {
  await signOut({ redirectTo: "/" });
}

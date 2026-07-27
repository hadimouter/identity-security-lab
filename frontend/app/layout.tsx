import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { auth } from "@/auth";
import { login, logout } from "@/app/actions";
import { SubmitButton } from "@/app/components/submit-button";
import { screensFor } from "@/lib/rbac";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Identity Security Lab",
  description:
    "Lab IAM : SSO OpenID Connect, RBAC, demandes d'accès et audit logs",
};

const BUTTON =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium " +
  "transition-colors hover:border-foreground/30 hover:bg-foreground/5";

async function Header() {
  const session = await auth();

  // Seuls les écrans déjà implémentés sont proposés dans la barre.
  const available = session
    ? screensFor(session.roles).filter((s) => s.status === "disponible")
    : [];

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-3xl items-center gap-5 px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Identity Security Lab
        </Link>

        {available.map((screen) => (
          <Link
            key={screen.href}
            href={screen.href}
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            {screen.label === "Profil et claims" ? "Profil" : screen.label}
          </Link>
        ))}

        <div className="ml-auto flex items-center gap-4">
          {session ? (
            <>
              <span className="hidden text-sm text-muted sm:inline">
                {session.user?.email}
              </span>
              <form action={logout}>
                <SubmitButton pendingLabel="Déconnexion…" className={BUTTON}>
                  Se déconnecter
                </SubmitButton>
              </form>
            </>
          ) : (
            <form action={login}>
              <SubmitButton pendingLabel="Redirection…" className={BUTTON}>
                Se connecter
              </SubmitButton>
            </form>
          )}
        </div>
      </nav>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
          {children}
        </main>
        <footer className="border-t border-border">
          <div className="mx-auto max-w-3xl px-6 py-6 text-xs text-muted">
            Lab d&apos;apprentissage. Comptes et données de démonstration
            uniquement.
          </div>
        </footer>
      </body>
    </html>
  );
}

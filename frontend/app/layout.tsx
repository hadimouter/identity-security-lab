import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { auth } from "@/auth";
import { login, logout } from "@/app/actions";
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

const buttonStyle =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium " +
  "transition-colors hover:border-foreground/30 hover:bg-foreground/5";

async function Header() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-3xl items-center gap-6 px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Identity Security Lab
        </Link>

        {session && (
          <Link
            href="/profile"
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            Profil
          </Link>
        )}

        <div className="ml-auto flex items-center gap-4">
          {session ? (
            <>
              <span className="hidden text-sm text-muted sm:inline">
                {session.user?.email}
              </span>
              <form action={logout}>
                <button className={buttonStyle}>Se déconnecter</button>
              </form>
            </>
          ) : (
            <form action={login}>
              <button className={buttonStyle}>Se connecter</button>
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

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
  description: "Lab IAM : SSO OpenID Connect, RBAC, demandes d'accès et audit logs",
};

async function Header() {
  const session = await auth();

  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <nav className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4 text-sm">
        <Link href="/" className="font-semibold">
          Identity Security Lab
        </Link>

        {session && (
          <Link href="/profile" className="opacity-70 hover:opacity-100">
            Profil
          </Link>
        )}

        <div className="ml-auto flex items-center gap-3">
          {session ? (
            <>
              <span className="opacity-60">{session.user?.email}</span>
              <form action={logout}>
                <button className="rounded border border-black/20 px-3 py-1 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10">
                  Se déconnecter
                </button>
              </form>
            </>
          ) : (
            <form action={login}>
              <button className="rounded border border-black/20 px-3 py-1 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10">
                Se connecter
              </button>
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
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}

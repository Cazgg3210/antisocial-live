import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4">
      <p className="text-center text-xs uppercase tracking-[0.4em] text-fg-subtle">Antisocial Live</p>
      <h1 className="text-gradient mb-6 text-center text-3xl font-black">Admin</h1>
      <LoginForm next={next ?? "/admin"} />
    </main>
  );
}

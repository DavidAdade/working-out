import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Where an invite link lands. The link signs in once only, and message apps open links to preview them, which
 * would use it up before the person ever saw it. So the link stops here and a tap carries it on to /auth/confirm.
 */
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash, type } = await searchParams;
  const ok = !!token_hash && /^[\w-]{20,200}$/.test(token_hash) && (type === "invite" || type === "magiclink");
  return (
    <main className="mt-10 flex flex-col gap-4">
      <h1 className="font-display text-5xl font-bold text-accent">WorkoutFlex</h1>
      <div className="card">
        {ok ? (
          <>
            <h2 className="font-display text-2xl font-bold">You&apos;re invited</h2>
            <p className="text-muted">Tap below to open your account. Next you&apos;ll set up your plan and choose a password, so you can sign in again later.</p>
            <a href={`/auth/confirm?token_hash=${encodeURIComponent(token_hash!)}&type=${type}`} className="btn text-center">
              Open my account
            </a>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold">This link isn&apos;t complete</h2>
            <p className="text-muted">Open the whole link you were sent, or ask for a new one.</p>
            <Link href="/login" className="btn-ghost text-center">
              Sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

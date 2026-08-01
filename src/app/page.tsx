import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

// Middleware is the first protection layer; this explicit check keeps the page safe if middleware behavior changes.
export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Smart Lists</h1>
      <p>Angemeldet als: {session?.user?.email}</p>
      {/* Slice 9: the entry point to /admin, replacing the purely informational "Admin: ja/nein"
          line. The session flag is good enough to decide VISIBILITY; authorization is the page's own
          job (requireAdmin reads the flag live from the DB, so a stale token gets redirected). */}
      {session?.user?.isAdmin && (
        <p>
          <Link href="/admin">Verwaltung</Link>
        </p>
      )}
      {/* Link to the projects section — added in Slice 2. */}
      <p>
        <Link href="/projects">Zu meinen Projekten</Link>
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit">Abmelden</button>
      </form>
    </main>
  );
}

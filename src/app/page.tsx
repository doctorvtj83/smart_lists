import { auth, signOut } from "@/auth";

// Thanks to middleware.ts this page is only reachable with a session, making it a compact auth-chain smoke test.
export default async function HomePage() {
  const session = await auth();

  return (
    <main style={{ padding: 24 }}>
      <h1>Smart Lists</h1>
      <p>Angemeldet als: {session?.user?.email}</p>
      <p>Admin: {session?.user?.isAdmin ? "ja" : "nein"}</p>
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

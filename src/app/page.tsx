import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

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

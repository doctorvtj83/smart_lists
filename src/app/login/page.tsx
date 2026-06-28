import { signIn } from "@/auth";

// Server Component with a Server Action: the form posts to the server so Auth.js can start Google OAuth securely.
export default function LoginPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Smart Lists — Anmeldung</h1>
      <p>Der Zugang ist geschlossen. Melde dich mit einem freigeschalteten Google-Konto an.</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button type="submit">Mit Google anmelden</button>
      </form>
    </main>
  );
}

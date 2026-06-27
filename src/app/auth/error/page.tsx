import Link from "next/link";

// Auth.js redirects rejected logins here when the signIn callback denies access.
export default function AuthErrorPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Zugang nicht freigeschaltet</h1>
      <p>
        Diese Google-Adresse ist nicht auf der Allowlist. Bitte wende dich an einen Administrator,
        um freigeschaltet zu werden.
      </p>
      <Link href="/login">Zurück zur Anmeldung</Link>
    </main>
  );
}

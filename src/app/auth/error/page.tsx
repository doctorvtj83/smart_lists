import Link from "next/link";
import { Lock } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import styles from "./page.module.css";

// Auth.js redirects rejected logins here when the signIn callback denies access.
// Slice 14 restyles it to handoff screen 3b: a friendly dead end, not an error page.
export default function AuthErrorPage() {
  return (
    <main className={styles.screen}>
      <div className={styles.glyph} aria-hidden="true">
        <Icon icon={Lock} size={24} />
      </div>
      <h1 className={styles.title}>Zugang nicht freigeschaltet</h1>
      <p className={styles.explanation}>
        Dieses Google-Konto ist noch nicht freigeschaltet. Ein Administrator muss deine
        E-Mail-Adresse zuerst einladen.
      </p>
      {/* The arrow is part of the label, exactly as in the design. */}
      <Link href="/login" className={styles.back}>
        ← Zurück zur Anmeldung
      </Link>
    </main>
  );
}

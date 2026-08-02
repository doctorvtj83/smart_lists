import { Check } from "lucide-react";
import { signIn } from "@/auth";
import { Icon } from "@/components/ui/Icon";
import { GoogleLogo } from "./GoogleLogo";
import styles from "./page.module.css";

// Server Component with a Server Action: the form posts to the server so Auth.js can start Google OAuth securely.
// Slice 14 restyles it to handoff screen 3a; the action itself is unchanged.
export default function LoginPage() {
  return (
    <main className={styles.screen}>
      {/* The logo tile is the app's mark: an accent square with a white check.
          aria-hidden because the wordmark right below already names the product. */}
      <div className={styles.logo} aria-hidden="true">
        <Icon icon={Check} size={30} />
      </div>
      <h1 className={styles.wordmark}>Smart Lists</h1>
      <p className={styles.kicker}>ANMELDUNG</p>
      <p className={styles.explanation}>
        Der Zugang ist geschlossen. Melde dich mit einem freigeschalteten Google-Konto an.
      </p>
      <form
        className={styles.form}
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        {/* A plain <button>, not the Button primitive: Google's branding rules own
            this control's colours and border (see page.module.css). */}
        <button type="submit" className={styles.googleButton}>
          <GoogleLogo />
          Mit Google anmelden
        </button>
      </form>
    </main>
  );
}

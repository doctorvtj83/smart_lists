"use client";

import { Menu } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { useDrawer } from "./DrawerContext";
import styles from "./DrawerTrigger.module.css";

/**
 * The ☰ button in every project screen's PageHeader `leading` slot.
 *
 * It is its own component (rather than a prop on PageHeader) because PageHeader
 * is a Server Component used by screens outside the project layout too — Home,
 * Projekte, Verwaltung have no drawer. Keeping the client code in the slot means
 * only the screens that HAVE a drawer pay for it.
 *
 * The button is hidden on desktop: there the sidebar is permanently visible, so
 * a trigger for it would open a drawer nobody needs.
 */
export function DrawerTrigger() {
  const { open } = useDrawer();

  return (
    <button type="button" aria-label="Menü öffnen" className={styles.trigger} onClick={open}>
      <Icon icon={Menu} size={19} />
    </button>
  );
}

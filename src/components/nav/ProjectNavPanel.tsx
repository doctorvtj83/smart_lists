"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  Library,
  ListChecks,
  LogOut,
  Plus,
  Shield,
  Star,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import styles from "./ProjectNavPanel.module.css";

/** The minimum the switcher needs about a project the user belongs to. */
export interface NavProject {
  id: string;
  name: string;
}

type ProjectNavPanelProps = {
  /** The project whose screens this panel navigates. */
  projectId: string;
  projectName: string;
  /** Every project the caller is a member of — the switcher's dropdown. */
  projects: NavProject[];
  activeListCount: number;
  memberCount: number;
  /** Drives the „Verwaltung" entry. Visibility only — /admin re-checks for real. */
  isAdmin: boolean;
  /** Server Action; passed down so the panel never touches auth itself. */
  signOutAction: () => Promise<void>;
  /** The mobile drawer passes its close(); the desktop sidebar passes nothing. */
  onNavigate?: () => void;
};

/** One nav row's data, before it is turned into a link. */
type NavEntry = {
  label: string;
  href: string;
  glyph: LucideIcon;
  /** Rendered right-aligned. Omitted (not "0") when the design shows no count. */
  count?: number;
};

/**
 * The navigation content shared by the mobile drawer and the desktop sidebar
 * (handoff § Navigation: „Gleicher Inhalt").
 *
 * Why one component for both: the two differ only in their container — an
 * overlay panel versus a fixed column. Building them separately would guarantee
 * that the next nav entry lands in one and not the other.
 *
 * Why it is a client component: the active row is derived from usePathname, and
 * the project switcher is a dropdown with local open state. The DATA is still
 * server-owned — everything arrives as props from the layout, so a project rename
 * shows up here through revalidation, not through a client fetch.
 */
export function ProjectNavPanel({
  projectId,
  projectName,
  projects,
  activeListCount,
  memberCount,
  isAdmin,
  signOutAction,
  onNavigate,
}: ProjectNavPanelProps) {
  const pathname = usePathname();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Exact comparison, not startsWith: „/projects/p1" is a prefix of every other
  // screen's path, so a prefix test would light up „Listen" everywhere.
  const isCurrent = (href: string) => pathname === href;

  const mainEntries: NavEntry[] = [
    { label: "Listen", href: `/projects/${projectId}`, glyph: ListChecks, count: activeListCount },
    { label: "Archiv", href: `/projects/${projectId}/archiv`, glyph: Archive },
  ];

  const projectEntries: NavEntry[] = [
    { label: "Favoriten", href: `/projects/${projectId}/favoriten`, glyph: Star },
    { label: "Katalog", href: `/projects/${projectId}/katalog`, glyph: Library },
    { label: "Mitglieder", href: `/projects/${projectId}/mitglieder`, glyph: Users, count: memberCount },
  ];

  // Every nav row is built here so the active styling, the icon size and the
  // drawer-closing callback can never drift between the two groups.
  const renderEntry = (entry: NavEntry) => {
    const active = isCurrent(entry.href);
    return (
      <Link
        key={entry.href}
        href={entry.href}
        // aria-current is the semantic half of the design's "white pill"; the
        // CSS Module hangs off the same attribute so the two cannot disagree.
        aria-current={active ? "page" : undefined}
        className={styles.entry}
        onClick={onNavigate}
      >
        <Icon icon={entry.glyph} size={17} className={styles.entryIcon} />
        <span className={styles.entryLabel}>{entry.label}</span>
        {entry.count === undefined ? null : (
          <span className={styles.entryCount}>{entry.count}</span>
        )}
      </Link>
    );
  };

  return (
    // <nav> gives the navigation landmark; the German label distinguishes it from
    // any other nav a screen might add later.
    <nav className={styles.panel} aria-label="Projektnavigation">
      <div className={styles.switcher}>
        <button
          type="button"
          className={styles.switcherCard}
          aria-expanded={switcherOpen}
          aria-label={`Projekt wechseln: ${projectName}`}
          onClick={() => setSwitcherOpen((open) => !open)}
        >
          <Avatar name={projectName} size={30} />
          <span className={styles.switcherName}>{projectName}</span>
          <Icon icon={ChevronDown} size={13} className={styles.switcherChevron} />
        </button>

        {switcherOpen && (
          <div className={styles.dropdown}>
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                // aria-current="true" (not "page"): from the switcher's point of
                // view this marks the SELECTED item of a list, which is what the
                // design's ✓ means — the page itself may be any of the five.
                aria-current={project.id === projectId ? "true" : undefined}
                className={styles.dropdownRow}
                onClick={() => {
                  setSwitcherOpen(false);
                  onNavigate?.();
                }}
              >
                <Avatar name={project.name} size={24} />
                <span className={styles.dropdownName}>{project.name}</span>
                {project.id === projectId && (
                  <Icon icon={Check} size={14} className={styles.dropdownCheck} />
                )}
              </Link>
            ))}
            {/* „＋ Neues Projekt…" goes to /projects, which is where the create
                row lives. A create form inside the dropdown would be a second
                place to maintain the same action. */}
            <Link
              href="/projects"
              className={styles.dropdownRow}
              onClick={() => {
                setSwitcherOpen(false);
                onNavigate?.();
              }}
            >
              <span className={styles.dropdownPlus} aria-hidden="true">
                <Icon icon={Plus} size={13} />
              </span>
              <span className={styles.dropdownNewLabel}>Neues Projekt…</span>
            </Link>
          </div>
        )}
      </div>

      <div className={styles.group}>{mainEntries.map(renderEntry)}</div>

      {/* Not a SectionLabel: that primitive is an <h2> for screen content, and a
          caption inside a nav landmark must not enter the document outline. */}
      <p className={styles.groupLabel}>PROJEKT</p>
      <div className={styles.group}>{projectEntries.map(renderEntry)}</div>

      <div className={styles.spacer} />

      {isAdmin && (
        <Link href="/admin" className={styles.entry} onClick={onNavigate}>
          <Icon icon={Shield} size={17} className={styles.entryIcon} />
          <span className={styles.entryLabel}>Verwaltung</span>
        </Link>
      )}

      {/* A form, not a link: signing out is a mutation, and the Server Action
          keeps the session handling on the server. */}
      <form action={signOutAction}>
        <button type="submit" className={styles.signOut}>
          <Icon icon={LogOut} size={17} className={styles.entryIcon} />
          <span className={styles.entryLabel}>Abmelden</span>
        </button>
      </form>
    </nav>
  );
}

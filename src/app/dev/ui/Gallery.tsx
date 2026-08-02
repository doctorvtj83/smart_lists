"use client";

import { useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ChipTabs } from "@/components/ui/ChipTabs";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { RowLink } from "@/components/ui/RowLink";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";

/**
 * A development-only gallery of every primitive from Slice 13.
 *
 * It is a client component because the sheets and chips need state. It is
 * deliberately plain: its job is to show the primitives, not to demonstrate
 * screen composition — that starts in Slice 14.
 */
export function Gallery() {
  const [chip, setChip] = useState("Alle");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [name, setName] = useState("Haushalt");
  const [favorites, setFavorites] = useState(["Milch", "Butter", "Brot"]);

  return (
    <main style={{ padding: 16, display: "flex", flexDirection: "column", gap: 18 }}>
      <SectionLabel>Buttons</SectionLabel>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Button>Anlegen</Button>
        <Button variant="secondary">Leere Liste</Button>
        <Button variant="text">Abmelden</Button>
        <Button variant="danger">Projekt löschen…</Button>
        <Button disabled>Deaktiviert</Button>
      </div>
      <Button fullWidth>Liste mit 7 Einträgen anlegen</Button>

      <SectionLabel>Felder</SectionLabel>
      <TextField label="Projektname" placeholder="Projektname" />
      <TextField label="Name" defaultValue="Milch" error="Artikel existiert bereits" />
      <TextField label="Menge" fieldSize="sm" placeholder="1,5" />

      <SectionLabel>Zeilen und Karten</SectionLabel>
      <RowLink
        href="/dev/ui"
        title="Haushalt"
        meta="3 Listen · 4 Mitglieder"
        leading={<Avatar name="Haushalt" />}
        trailing={<Badge>OWNER</Badge>}
      />
      <RowLink
        href="/dev/ui"
        title="Camping"
        meta="1 Liste · 2 Mitglieder"
        leading={<Avatar name="Camping" />}
      />
      <Card elevated>
        <div style={{ padding: 14 }}>
          <strong>Einkauf Samstag</strong>
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
            Haushalt · 5 von 8 offen
          </div>
        </div>
      </Card>

      <SectionLabel>Chips</SectionLabel>
      <ChipTabs
        options={["Alle", "Molkerei", "Obst & Gemüse", "Ohne Kategorie"]}
        value={chip}
        onChange={setChip}
        label="Kategorien"
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {favorites.map((favorite) => (
          <Chip
            key={favorite}
            tone="outline"
            removeLabel={`${favorite} entfernen`}
            onRemove={() => setFavorites((current) => current.filter((f) => f !== favorite))}
          >
            {favorite}
          </Chip>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Chip tone="accent">★ Milch</Chip>
        <Chip tone="neutral">Äpfel</Chip>
        <Chip selected onClick={() => {}}>
          Molkerei
        </Chip>
        <Chip struck>Joghurt</Chip>
      </div>

      <SectionLabel>Banner</SectionLabel>
      <Banner tone="info" action={<Button variant="text">Abschließen</Button>}>
        Alle Einträge sind abgehakt.
      </Banner>
      <Banner tone="success" action={<Button variant="text">Wieder öffnen</Button>}>
        Abgeschlossen am 19.07.2026
      </Banner>

      <SectionLabel>Inline bearbeiten</SectionLabel>
      <InlineEdit value={name} label="Projektname" onSave={setName} />

      <SectionLabel>Sheets</SectionLabel>
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={() => setSheetOpen(true)}>Sheet öffnen</Button>
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>
          Zugang entziehen
        </Button>
      </div>

      <SectionLabel>Leerer Zustand</SectionLabel>
      <div style={{ height: 300, display: "flex" }}>
        <EmptyState
          icon={<Icon icon={Star} size={22} />}
          shape="circle"
          tone="accent"
          title="Noch keine Favoriten"
          description="Favoriten landen automatisch in jeder vorbefüllten Liste — perfekt für Milch, Brot & Co."
        >
          <TextField placeholder="Artikelname" />
          <Button>Als Favorit</Button>
        </EmptyState>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Neue Liste">
        <TextField label="Listenname" placeholder="Listenname" />
        <div style={{ marginTop: 16 }}>
          <Button fullWidth onClick={() => setSheetOpen(false)}>
            Liste anlegen
          </Button>
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Zugang entziehen: anna@web.de"
        options={[
          {
            label: "Nur Zugang entziehen",
            description:
              "Keine neuen Logins. Mitgliedschaften bleiben — erneutes Einladen stellt alles wieder her.",
            tone: "neutral",
            onSelect: () => setConfirmOpen(false),
          },
          {
            label: "Zugang entziehen und aus allen Projekten entfernen",
            description:
              "Sofort und endgültig — erneutes Einladen bringt die Mitgliedschaften nicht zurück.",
            tone: "danger",
            onSelect: () => setConfirmOpen(false),
          },
        ]}
      >
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 6 }}>
          Mitglied in diesen Projekten:
        </p>
      </ConfirmSheet>

      <div style={{ display: "flex", gap: 8, color: "var(--color-text-muted)" }}>
        <Icon icon={Trash2} />
        <span style={{ fontSize: 12 }}>Icon-Set: Lucide, Stroke 1.75</span>
      </div>
    </main>
  );
}

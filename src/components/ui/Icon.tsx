import type { LucideIcon } from "lucide-react";

type IconProps = {
  /** A Lucide glyph component, e.g. `ChevronRight` from "lucide-react". */
  icon: LucideIcon;
  /** Pixel size. 17 matches the placeholder squares in the design handoff. */
  size?: number;
  /** Colour is inherited from `currentColor`; pass a CSS Module class to change it. */
  className?: string;
};

/**
 * The single place icons are rendered.
 *
 * Why it exists: the design deliberately ships placeholder squares and only says
 * "pick one set, stroke ~1.75". Funnelling every glyph through this wrapper is
 * what makes that consistent — no call site can accidentally use a different
 * stroke width, and swapping the icon set later is a one-file change.
 *
 * Icons in this product are always decorative: every control they sit in also
 * carries a text label or an aria-label, so the glyph is hidden from screen
 * readers to avoid a duplicate announcement.
 */
export function Icon({ icon: Glyph, size = 17, className }: IconProps) {
  return <Glyph size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
}

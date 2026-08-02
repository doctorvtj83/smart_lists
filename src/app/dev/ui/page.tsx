import { notFound } from "next/navigation";
import { Gallery } from "./Gallery";

// A Server Component wrapper exists purely for this guard: the gallery is a
// development tool, and shipping it on the public app would expose an
// unauthenticated route. NODE_ENV is inlined at build time, so the production
// bundle contains a route that does nothing but 404.
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}

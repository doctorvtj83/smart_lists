// Wires Auth.js to every /api/auth/* endpoint, including provider login, callback, and sign-out.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;

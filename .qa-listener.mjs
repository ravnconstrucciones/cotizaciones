import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("/Users/ezeotero/Documents/ravn/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const topic = process.argv[2] ?? "hilo:test-broadcast";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const ch = sb.channel(topic, { config: { broadcast: { self: false } } });
ch.on("broadcast", { event: "parcial" }, ({ payload }) => {
  console.log(`[${new Date().toISOString()}] PARCIAL len=${(payload?.texto ?? "").length} trabajo=${payload?.trabajo_id ?? "-"} :: ${(payload?.texto ?? "").slice(-80).replace(/\n/g, " ")}`);
});
ch.on("broadcast", { event: "fin" }, ({ payload }) => {
  console.log(`[${new Date().toISOString()}] FIN len=${(payload?.texto ?? "").length} trabajo=${payload?.trabajo_id ?? "-"}`);
  console.log("TEXTO FINAL:\n" + (payload?.texto ?? ""));
  setTimeout(() => process.exit(0), 500);
});
ch.subscribe((status) => {
  console.log(`[${new Date().toISOString()}] canal ${topic}: ${status}`);
});

setTimeout(() => { console.log("timeout listener"); process.exit(1); }, 300_000);

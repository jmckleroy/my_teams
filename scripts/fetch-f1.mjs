/**
 * Fetch Ferrari's full F1 season schedule from the jolpica-f1 API
 * (free, no-auth, open-source successor to Ergast).
 *
 * Produces our normalized event schema and writes it to:
 *   - data/f1.json               (this source's events, cached)
 *   - data/events.json           (merged feed, all sources)
 *   - data/events.js             (same data as a browser <script>, so index.html
 *                                 works when opened directly via file://)
 *
 * Personal, non-commercial, low-frequency use. Results are cached locally in
 * .cache/ so re-runs within CACHE_TTL_HOURS don't re-hit the API.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CACHE_DIR = path.join(ROOT, ".cache");

const SEASON = process.env.F1_SEASON || String(new Date().getUTCFullYear());
const CONSTRUCTOR = "ferrari";
const API = `https://api.jolpi.ca/ergast/f1/${SEASON}/constructors/${CONSTRUCTOR}/races/?format=json`;
const CACHE_TTL_HOURS = 12;

// jolpica gives circuit lat/long but no timezone. Small hand-maintained map of
// circuitId -> IANA timezone for the current F1 calendar. Anything missing falls
// back to null (the UI then shows only the America/Chicago time).
const CIRCUIT_TZ = {
  albert_park: "Australia/Melbourne",
  shanghai: "Asia/Shanghai",
  suzuka: "Asia/Tokyo",
  bahrain: "Asia/Bahrain",
  jeddah: "Asia/Riyadh",
  miami: "America/New_York",
  imola: "Europe/Rome",
  monaco: "Europe/Monaco",
  catalunya: "Europe/Madrid",
  villeneuve: "America/Toronto",
  red_bull_ring: "Europe/Vienna",
  silverstone: "Europe/London",
  hungaroring: "Europe/Budapest",
  spa: "Europe/Brussels",
  zandvoort: "Europe/Amsterdam",
  monza: "Europe/Rome",
  baku: "Asia/Baku",
  marina_bay: "Asia/Singapore",
  americas: "America/Chicago",
  rodriguez: "America/Mexico_City",
  interlagos: "America/Sao_Paulo",
  vegas: "America/Los_Angeles",
  losail: "Asia/Qatar",
  yas_marina: "Asia/Dubai",
  madring: "Europe/Madrid",
};

// No free sports API carries broadcast data. It's supplied by hand in
// data/broadcast-overrides.json (per-event, with a per-competition default).
const OVERRIDES_FILE = path.join(DATA_DIR, "broadcast-overrides.json");

async function loadBroadcastOverrides() {
  try {
    return JSON.parse(await readFile(OVERRIDES_FILE, "utf8"));
  } catch {
    return { defaults: {}, events: {} };
  }
}

function resolveBroadcast(overrides, eventId, competition) {
  return (
    overrides.events?.[eventId] ??
    overrides.defaults?.[competition] ??
    null
  );
}

// Which weekend sessions to include. Practice sessions are intentionally excluded
// (Phase 1 scope: races, qualifying, sprint).
const SESSIONS = [
  { key: "SprintQualifying", label: "Sprint Qualifying" },
  { key: "Sprint", label: "Sprint" },
  { key: "Qualifying", label: "Qualifying" },
  { key: "__race__", label: "Race" },
];

async function fetchWithCache(url) {
  await mkdir(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(
    CACHE_DIR,
    url.replace(/[^a-z0-9]+/gi, "_").slice(0, 120) + ".json"
  );
  if (existsSync(cacheFile)) {
    const raw = await readFile(cacheFile, "utf8");
    const cached = JSON.parse(raw);
    const ageHours = (Date.now() - cached.__fetchedAt) / 3.6e6;
    if (ageHours < CACHE_TTL_HOURS) {
      console.log(`  (cache hit, ${ageHours.toFixed(1)}h old) ${url}`);
      return cached.body;
    }
  }
  console.log(`  GET ${url}`);
  const res = await fetch(url, {
    headers: { "User-Agent": "personal-sports-calendar (non-commercial)" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const body = await res.json();
  await writeFile(
    cacheFile,
    JSON.stringify({ __fetchedAt: Date.now(), body }, null, 2)
  );
  return body;
}

function toIsoUtc(date, time) {
  // jolpica time looks like "13:00:00Z"
  return `${date}T${time.replace(/Z?$/, "Z")}`;
}

function buildEvents(apiBody, overrides) {
  const races = apiBody?.MRData?.RaceTable?.Races ?? [];
  const events = [];

  for (const race of races) {
    const loc = race.Circuit?.Location ?? {};
    const tz = CIRCUIT_TZ[race.Circuit?.circuitId] ?? null;
    const venue = {
      name: race.Circuit?.circuitName ?? null,
      city: loc.locality ?? null,
      country: loc.country ?? null,
      tz,
    };

    for (const session of SESSIONS) {
      const block =
        session.key === "__race__"
          ? { date: race.date, time: race.time }
          : race[session.key];
      if (!block?.date || !block?.time) continue;

      const id = `f1-${SEASON}-r${race.round}-${session.label
        .toLowerCase()
        .replace(/\s+/g, "-")}`;
      const competition = "FIA Formula 1 World Championship";

      events.push({
        id,
        sport: "Formula 1",
        team: "Ferrari",
        competition,
        session: session.label,
        title: `${race.raceName} — ${session.label}`,
        competitors: null,
        start_utc: toIsoUtc(block.date, block.time),
        venue,
        broadcast: resolveBroadcast(overrides, id, competition),
        source: "jolpica-f1",
        source_url: race.url ?? null,
      });
    }
  }

  events.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
  return events;
}

async function main() {
  console.log(`Fetching Ferrari ${SEASON} F1 schedule...`);
  const body = await fetchWithCache(API);
  const overrides = await loadBroadcastOverrides();
  const f1Events = buildEvents(body, overrides);
  console.log(`  -> ${f1Events.length} events`);

  await mkdir(DATA_DIR, { recursive: true });

  const f1Payload = {
    source: "jolpica-f1",
    season: SEASON,
    generated: new Date().toISOString(),
    events: f1Events,
  };
  await writeFile(
    path.join(DATA_DIR, "f1.json"),
    JSON.stringify(f1Payload, null, 2)
  );

  // Merge all per-source files into the combined feed. Today only f1.json exists;
  // nfl.json / bayern.json will slot in here later.
  const sourceFiles = ["f1.json", "nfl.json", "bayern.json"];
  let allEvents = [];
  for (const file of sourceFiles) {
    const p = path.join(DATA_DIR, file);
    if (!existsSync(p)) continue;
    const parsed = JSON.parse(await readFile(p, "utf8"));
    allEvents = allEvents.concat(parsed.events ?? []);
  }
  allEvents.sort((a, b) => a.start_utc.localeCompare(b.start_utc));

  const combined = {
    generated: new Date().toISOString(),
    viewer_tz: "America/Chicago",
    count: allEvents.length,
    events: allEvents,
  };
  await writeFile(
    path.join(DATA_DIR, "events.json"),
    JSON.stringify(combined, null, 2)
  );
  await writeFile(
    path.join(DATA_DIR, "events.js"),
    `// Auto-generated by scripts/fetch-f1.mjs - do not edit by hand.\n` +
      `window.SPORTS_CALENDAR_DATA = ${JSON.stringify(combined, null, 2)};\n`
  );

  console.log(
    `Wrote data/f1.json, data/events.json, data/events.js (${allEvents.length} total events).`
  );
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});

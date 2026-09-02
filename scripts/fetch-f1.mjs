/**
 * Ferrari's full F1 season schedule from the jolpica-f1 API (free, no-auth,
 * open-source successor to Ergast). Includes races, qualifying, sprint and
 * sprint qualifying; practice sessions are excluded.
 *
 * Writes data/f1.json, then rebuilds the combined feed. See scripts/lib/common.mjs.
 */

import {
  fetchWithCache,
  loadBroadcastOverrides,
  rebuildCombined,
  resolveBroadcast,
  writeSource,
} from "./lib/common.mjs";

const SEASON = process.env.F1_SEASON || String(new Date().getUTCFullYear());
const CONSTRUCTOR = "ferrari";
const API = `https://api.jolpi.ca/ergast/f1/${SEASON}/constructors/${CONSTRUCTOR}/races/?format=json`;
const COMPETITION = "FIA Formula 1 World Championship";

// jolpica gives circuit lat/long but no timezone. Hand-maintained map of
// circuitId -> IANA timezone for the current F1 calendar. Missing -> null
// (the UI then shows only the viewer's time).
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

const SESSIONS = [
  { key: "SprintQualifying", label: "Sprint Qualifying" },
  { key: "Sprint", label: "Sprint" },
  { key: "Qualifying", label: "Qualifying" },
  { key: "__race__", label: "Race" },
];

function toIsoUtc(date, time) {
  // jolpica time looks like "13:00:00Z"
  return `${date}T${time.replace(/Z?$/, "Z")}`;
}

function buildEvents(apiBody, overrides) {
  const races = apiBody?.MRData?.RaceTable?.Races ?? [];
  const events = [];

  for (const race of races) {
    const loc = race.Circuit?.Location ?? {};
    const venue = {
      name: race.Circuit?.circuitName ?? null,
      city: loc.locality ?? null,
      country: loc.country ?? null,
      tz: CIRCUIT_TZ[race.Circuit?.circuitId] ?? null,
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

      events.push({
        id,
        sport: "Formula 1",
        team: "Ferrari",
        competition: COMPETITION,
        session: session.label,
        title: `${race.raceName} — ${session.label}`,
        competitors: null,
        start_utc: toIsoUtc(block.date, block.time),
        venue,
        broadcast: resolveBroadcast(overrides, id, COMPETITION, null),
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
  const events = buildEvents(body, overrides);
  console.log(`  -> ${events.length} events`);

  await writeSource("f1.json", {
    source: "jolpica-f1",
    season: SEASON,
    generated: new Date().toISOString(),
    events,
  });
  await rebuildCombined();
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});

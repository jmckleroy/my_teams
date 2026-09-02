/**
 * FC Bayern Munich fixtures across every competition, from ESPN's public
 * (undocumented) soccer site API - the same shape as the Titans pipeline.
 *
 * Endpoint (no auth), one call per competition:
 *   site.api.espn.com/apis/site/v2/sports/soccer/<league>/teams/132/schedule
 *   site.api.espn.com/apis/site/v2/sports/soccer/<league>/teams/132/schedule?fixture=true
 *
 * The plain call returns completed/current matches, `?fixture=true` returns the
 * upcoming ones; we fetch both and dedupe. Bayern's ESPN team id is 132.
 *
 * Writes data/bayern.json, then rebuilds the combined feed.
 */

import {
  fetchWithCache,
  loadBroadcastOverrides,
  rebuildCombined,
  resolveBroadcast,
  writeSource,
} from "./lib/common.mjs";

const TEAM_ID = "132"; // FC Bayern Munich (ESPN)

// ESPN league slug -> display name used as `competition`.
const LEAGUES = [
  { slug: "ger.1", competition: "Bundesliga" },
  { slug: "uefa.champions", competition: "UEFA Champions League" },
  { slug: "ger.dfb_pokal", competition: "DFB-Pokal" },
  { slug: "ger.super_cup", competition: "DFL-Supercup" },
];

// Drop anything older than this many days so a stray previous-season fixture
// (an old Supercup, a past cup exit) doesn't clutter the calendar.
const KEEP_DAYS_BACK = Number(process.env.BAYERN_KEEP_DAYS_BACK || 45);

// ESPN gives venue city + country but no timezone. Every country Bayern plays a
// match in has a single civil timezone, so key off that; venue overrides handle
// the rare exception. Missing -> null (UI then shows only the viewer's time).
const COUNTRY_TZ = {
  Germany: "Europe/Berlin",
  England: "Europe/London",
  Scotland: "Europe/London",
  Wales: "Europe/London",
  Ireland: "Europe/Dublin",
  France: "Europe/Paris",
  Spain: "Europe/Madrid",
  Portugal: "Europe/Lisbon",
  Italy: "Europe/Rome",
  Netherlands: "Europe/Amsterdam",
  Belgium: "Europe/Brussels",
  Austria: "Europe/Vienna",
  Switzerland: "Europe/Zurich",
  Norway: "Europe/Oslo",
  Sweden: "Europe/Stockholm",
  Denmark: "Europe/Copenhagen",
  Czechia: "Europe/Prague",
  "Czech Republic": "Europe/Prague",
  Poland: "Europe/Warsaw",
  Croatia: "Europe/Zagreb",
  Serbia: "Europe/Belgrade",
  Hungary: "Europe/Budapest",
  Slovakia: "Europe/Bratislava",
  Slovenia: "Europe/Ljubljana",
  Greece: "Europe/Athens",
  Turkey: "Europe/Istanbul",
  Ukraine: "Europe/Kyiv",
  Cyprus: "Asia/Nicosia",
  USA: "America/New_York",
};

const VENUE_TZ = {};

function url(slug, fixture) {
  return (
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}` +
    `/teams/${TEAM_ID}/schedule${fixture ? "?fixture=true" : ""}`
  );
}

function normalizeIso(s) {
  // ESPN dates look like "2026-11-03T20:00Z" - add seconds for a clean ISO string.
  return s.replace(/T(\d\d:\d\d)Z$/, "T$1:00Z");
}

// ESPN abbreviates network names in the broadcast feed; expand the ones we see.
const NETWORK_NAMES = {
  "USA Net": "USA Network",
};

function broadcastFromApi(competition) {
  const names = (competition.broadcasts ?? [])
    .map((b) => b?.media?.shortName)
    .filter(Boolean)
    .map((n) => NETWORK_NAMES[n] ?? n);
  return names.length ? [...new Set(names)].join(" / ") : null;
}

function roundLabel(ev) {
  // seasonType.name is a real round for cup competitions ("First Round",
  // "League Phase", "Quarterfinal") but just the competition name for the
  // league and Supercup - drop those (they carry a season year).
  const name = ev.seasonType?.name;
  if (!name || /\d{4}/.test(name)) return null;
  return name;
}

function sourceUrl(ev) {
  const link = (ev.links ?? []).find(
    (l) => l.rel?.includes("summary") && l.rel?.includes("desktop")
  );
  return link?.href ?? null;
}

// ESPN abbreviates Bayern as "MUN"; swap it for the more familiar "FCB" in the
// short title (e.g. "VFB @ MUN" -> "VFB @ FCB"). Keyed off the team id so an
// opponent that happens to abbreviate to "MUN" is never touched.
function shortTitle(ev, home, away) {
  if (!ev.shortName) return null;
  const bayern = [home, away].find((c) => String(c.team?.id) === TEAM_ID);
  const abbr = bayern?.team?.abbreviation;
  if (!abbr) return ev.shortName;
  return ev.shortName.replace(new RegExp(`\\b${abbr}\\b`), "FCB");
}

function buildEvents(pages, overrides) {
  const bySource = new Map(); // espn event id -> normalized event
  const cutoff = Date.now() - KEEP_DAYS_BACK * 86400e3;

  for (const { competition, body } of pages) {
    for (const ev of body.events ?? []) {
      if (bySource.has(ev.id)) continue;

      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const home = comp.competitors?.find((c) => c.homeAway === "home");
      const away = comp.competitors?.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      const start_utc = normalizeIso(ev.date);
      if (new Date(start_utc).getTime() < cutoff) continue;

      const addr = comp.venue?.address ?? {};
      const venueName = comp.venue?.fullName ?? null;
      const country = addr.country ?? null;
      const tz = VENUE_TZ[venueName] ?? COUNTRY_TZ[country] ?? null;

      const id = `bayern-${ev.id}`;
      bySource.set(ev.id, {
        id,
        sport: "Soccer",
        team: "FC Bayern Munich",
        competition,
        session: roundLabel(ev),
        title:
          ev.name ??
          `${away.team?.displayName} at ${home.team?.displayName}`,
        short_title: shortTitle(ev, home, away), // e.g. "VFB @ FCB"
        competitors: [away.team?.displayName, home.team?.displayName],
        start_utc,
        venue: {
          name: venueName,
          city: addr.city ?? null,
          region: null,
          country,
          tz,
        },
        broadcast: resolveBroadcast(
          overrides,
          id,
          competition,
          broadcastFromApi(comp)
        ),
        source: "espn-soccer",
        source_url: sourceUrl(ev),
      });
    }
  }

  const events = [...bySource.values()];
  events.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
  return events;
}

async function main() {
  console.log("Fetching FC Bayern Munich fixtures (ESPN)...");
  const pages = [];
  for (const { slug, competition } of LEAGUES) {
    for (const fixture of [false, true]) {
      try {
        const body = await fetchWithCache(url(slug, fixture));
        pages.push({ competition, body });
      } catch (err) {
        console.warn(`  ${competition} (${slug}): skipped (${err.message})`);
      }
    }
    const count = pages
      .filter((p) => p.competition === competition)
      .reduce((n, p) => n + (p.body.events?.length ?? 0), 0);
    console.log(`  ${competition}: ${count} raw entries`);
  }

  const overrides = await loadBroadcastOverrides();
  const events = buildEvents(pages, overrides);
  console.log(`  -> ${events.length} events`);

  await writeSource("bayern.json", {
    source: "espn-soccer",
    generated: new Date().toISOString(),
    events,
  });
  await rebuildCombined();
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});

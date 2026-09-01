/**
 * Tennessee Titans schedule from ESPN's public (undocumented) site API.
 * Covers preseason, regular season, and playoffs for the given season.
 *
 * Endpoint (no auth):
 *   site.api.espn.com/apis/site/v2/sports/football/nfl/teams/ten/schedule
 *     ?season=<year>&seasontype=<1 pre | 2 regular | 3 post>
 *
 * Writes data/nfl.json, then rebuilds the combined feed.
 */

import {
  fetchWithCache,
  loadBroadcastOverrides,
  rebuildCombined,
  resolveBroadcast,
  writeSource,
} from "./lib/common.mjs";

const TEAM = "ten"; // Tennessee Titans
// NFL season "year" rolls over in the calendar year it starts in. Aug-Dec ->
// this year; Jan-Jul -> last year's season.
const now = new Date();
const SEASON =
  process.env.NFL_SEASON ||
  String(now.getUTCFullYear() - (now.getUTCMonth() < 7 ? 1 : 0));

const SEASON_TYPES = [
  { id: 1, competition: "NFL Preseason" },
  { id: 2, competition: "NFL Regular Season" },
  { id: 3, competition: "NFL Playoffs" },
];

// Home stadium timezone by NFL team abbreviation (ESPN's abbreviations).
const TEAM_TZ = {
  ARI: "America/Phoenix",
  ATL: "America/New_York",
  BAL: "America/New_York",
  BUF: "America/New_York",
  CAR: "America/New_York",
  CHI: "America/Chicago",
  CIN: "America/New_York",
  CLE: "America/New_York",
  DAL: "America/Chicago",
  DEN: "America/Denver",
  DET: "America/New_York",
  GB: "America/Chicago",
  HOU: "America/Chicago",
  IND: "America/Indiana/Indianapolis",
  JAX: "America/New_York",
  KC: "America/Chicago",
  LV: "America/Los_Angeles",
  LAC: "America/Los_Angeles",
  LAR: "America/Los_Angeles",
  MIA: "America/New_York",
  MIN: "America/Chicago",
  NE: "America/New_York",
  NO: "America/Chicago",
  NYG: "America/New_York",
  NYJ: "America/New_York",
  PHI: "America/New_York",
  PIT: "America/New_York",
  SF: "America/Los_Angeles",
  SEA: "America/Los_Angeles",
  TB: "America/New_York",
  TEN: "America/Chicago",
  WSH: "America/New_York",
};

// International games: the home team's abbreviation is still a US team, so key
// the timezone off the actual venue name instead.
const VENUE_TZ = {
  "Wembley Stadium": "Europe/London",
  "Tottenham Hotspur Stadium": "Europe/London",
  "Allianz Arena": "Europe/Berlin",
  "Deutsche Bank Park": "Europe/Berlin",
  "Estadio Azteca": "America/Mexico_City",
  "Arena Corinthians": "America/Sao_Paulo",
};

function url(seasonType) {
  return (
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${TEAM}` +
    `/schedule?season=${SEASON}&seasontype=${seasonType}`
  );
}

function broadcastFromApi(competition) {
  const names = (competition.broadcasts ?? [])
    .map((b) => b?.media?.shortName)
    .filter(Boolean);
  return names.length ? [...new Set(names)].join(" / ") : null;
}

function normalizeIso(s) {
  // ESPN dates look like "2026-09-13T17:00Z" - add seconds for a clean ISO string.
  return s.replace(/T(\d\d:\d\d)Z$/, "T$1:00Z");
}

function buildEvents(pages, overrides) {
  const events = [];
  const seen = new Set();

  for (const { competition: competitionName, body } of pages) {
    for (const ev of body.events ?? []) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);

      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const home = comp.competitors?.find((c) => c.homeAway === "home");
      const away = comp.competitors?.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      const addr = comp.venue?.address ?? {};
      const venueName = comp.venue?.fullName ?? null;
      const tz =
        VENUE_TZ[venueName] ??
        TEAM_TZ[home.team?.abbreviation] ??
        null;

      const id = `nfl-${ev.id}`;
      events.push({
        id,
        sport: "NFL",
        team: "Tennessee Titans",
        competition: competitionName,
        session: ev.week?.text ?? null,
        title: ev.name ?? `${away.team?.displayName} at ${home.team?.displayName}`,
        short_title: ev.shortName ?? null, // e.g. "NYJ @ TEN"
        competitors: [away.team?.displayName, home.team?.displayName],
        start_utc: normalizeIso(ev.date),
        venue: {
          name: venueName,
          city: addr.city ?? null,
          region: addr.state ?? null, // US state abbr, e.g. "TN"
          country: addr.country ?? "USA",
          tz,
        },
        broadcast: resolveBroadcast(
          overrides,
          id,
          competitionName,
          broadcastFromApi(comp)
        ),
        source: "espn-nfl",
        source_url: `https://www.espn.com/nfl/game/_/gameId/${ev.id}`,
      });
    }
  }

  events.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
  return events;
}

async function main() {
  console.log(`Fetching Tennessee Titans ${SEASON} schedule (ESPN)...`);
  const pages = [];
  for (const st of SEASON_TYPES) {
    try {
      const body = await fetchWithCache(url(st.id));
      pages.push({ competition: st.competition, body });
      console.log(`  ${st.competition}: ${(body.events ?? []).length} games`);
    } catch (err) {
      console.warn(`  ${st.competition}: skipped (${err.message})`);
    }
  }

  const overrides = await loadBroadcastOverrides();
  const events = buildEvents(pages, overrides);
  console.log(`  -> ${events.length} events`);

  await writeSource("nfl.json", {
    source: "espn-nfl",
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

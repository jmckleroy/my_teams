# Sports Calendar

A personal calendar for the teams I follow — plain HTML/CSS/JS, event data in a
JSON file, no build step.

**Live:** https://jmckleroy.github.io/my_teams/ — hosted on GitHub Pages straight
from `main`. A scheduled GitHub Action re-fetches every source once a day and
commits the data if it changed (see `.github/workflows/refresh-data.yml`); the
push redeploys Pages automatically.

## Teams tracked

| Team              | Scope                                             | Data source            | Status         |
| ----------------- | ------------------------------------------------- | ---------------------- | -------------- |
| Ferrari (F1)      | Races, qualifying, sprint + sprint qualifying     | jolpica-f1 API         | ✅ working      |
| Tennessee Titans  | NFL preseason + regular season + playoffs         | ESPN public site API   | ✅ working      |
| FC Bayern Munich  | Bundesliga, UCL, DFB-Pokal, DFL-Supercup          | ESPN public site API   | ✅ working      |

## Usage

```sh
# Refresh event data (each writes data/<source>.json then rebuilds
# data/events.json + data/events.js)
npm run fetch:f1
npm run fetch:nfl
npm run fetch:bayern
npm run fetch:all   # all three

# View: open index.html directly in a browser, or serve the folder
npx serve .
```

`index.html` reads `data/events.js` via a `<script>` tag so it works from `file://`
with no server. `data/events.json` is the same data in plain JSON.

## Layout

```
index.html                     page shell
css/styles.css                 styling (month grid view)
js/app.js                      month calendar grid, filters, detail panel,
                               browser-side timezone conversion
scripts/lib/common.mjs         shared: cache, broadcast lookup, feed merge
scripts/fetch-f1.mjs           Ferrari schedule from jolpica-f1 -> events
scripts/fetch-nfl.mjs          Titans schedule from ESPN -> events
scripts/fetch-bayern.mjs       Bayern fixtures (all competitions) from ESPN -> events
data/broadcast-overrides.json  hand-edited TV/stream per event (not generated)
data/                          generated event data + .cache/ of raw responses
```

## Broadcast / TV data

Edit `data/broadcast-overrides.json` by hand. Lookup order per event:
per-event `events[<id>]` → per-competition `defaults[<competition>]` → the
value from the source API → "TBD". F1 has no broadcast in its API so it relies
on `defaults`; NFL games carry a real network from ESPN, so only add an NFL
entry to correct one. For Bayern the ESPN API carries the right per-match value
where it has one: UCL is a `Paramount+` default, and Bundesliga / Supercup
matches (Versant's rights from 2026-27) come through as `USA Network` or
`Fandango` once ESPN assigns them — blank ("TBD") until then. Re-run the fetch
to apply.

## Event schema

```jsonc
{
  "id": "f1-2026-r1-race",
  "sport": "Formula 1",
  "team": "Ferrari",
  "competition": "FIA Formula 1 World Championship",
  "session": "Race",                // F1 session type, NFL week text, or cup round; null otherwise
  "title": "Australian Grand Prix — Race",
  "competitors": null,              // ["Away", "Home"] for NFL/soccer; null for F1
  "short_title": null,              // NFL: "NYJ @ TEN"; soccer: "VFB @ FCB"; used for calendar chips
  "start_utc": "2026-03-08T04:00:00Z",
  "venue": { "name": "...", "city": "...", "region": null, "country": "...", "tz": "Australia/Melbourne" },
  "broadcast": "ESPN / ABC (US)",
  "source": "jolpica-f1",
  "source_url": "https://en.wikipedia.org/wiki/2026_Australian_Grand_Prix"
}
```

## Known gaps

- **F1 broadcast** comes from `data/broadcast-overrides.json`, not an API (see above).
- **2026 F1 calendar** is only partially published upstream (~12 rounds so far);
  re-run the fetch later to pick up the rest.
- **NFL timezones** are derived from the home team (map in `scripts/fetch-nfl.mjs`),
  with a venue-name override for international games.
- **Bayern timezones** are derived from the venue country (map in
  `scripts/fetch-bayern.mjs`) — fine for European football, which is single-tz
  per country.
- **DFB-Pokal** only publishes one round at a time; re-run the fetch after each
  draw to pick up later rounds. Bayern knockout ties in the UCL appear the same way.
- **ESPN's site API is undocumented** (both NFL and soccer) — endpoint shape
  could change without notice.

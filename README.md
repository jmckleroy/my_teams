# Sports Calendar

A personal calendar for the teams I follow. **Phase 1: a local static site** — plain
HTML/CSS/JS, event data in a JSON file, opened directly in the browser.

## Teams tracked (Phase 1)

| Team              | Scope                                             | Data source            | Status         |
| ----------------- | ------------------------------------------------- | ---------------------- | -------------- |
| Ferrari (F1)      | Races, qualifying, sprint + sprint qualifying     | jolpica-f1 API         | ✅ working      |
| Tennessee Titans  | NFL regular + post season                         | ESPN public endpoints  | ⏳ not started  |
| FC Bayern Munich  | All competitions (BL, UCL, DFB-Pokal, Supercup…)  | Firecrawl scrape       | ⏳ not started  |

## Usage

```sh
# Refresh event data (writes data/f1.json, data/events.json, data/events.js)
npm run fetch:f1

# View: open index.html directly in a browser, or serve the folder
npx serve .
```

`index.html` reads `data/events.js` via a `<script>` tag so it works from `file://`
with no server. `data/events.json` is the same data for later phases.

## Layout

```
index.html                     page shell
css/styles.css                 styling (month grid view)
js/app.js                      month calendar grid, filters, detail panel,
                               browser-side timezone conversion
scripts/fetch-f1.mjs           Ferrari schedule from jolpica-f1 -> events
data/broadcast-overrides.json  hand-edited TV/stream per event (not generated)
data/                          generated event data + .cache/ of raw responses
```

## Broadcast / TV data

No free sports API carries this. Edit `data/broadcast-overrides.json` by hand:
`events` maps an event id to a network; `defaults` sets a per-competition
fallback; anything unset shows as "TBD". Re-run the fetch to apply.

## Event schema

```jsonc
{
  "id": "f1-2026-r1-race",
  "sport": "Formula 1",
  "team": "Ferrari",
  "competition": "FIA Formula 1 World Championship",
  "session": "Race",
  "title": "Australian Grand Prix — Race",
  "competitors": null,              // teams/competitors, when applicable
  "start_utc": "2026-03-08T04:00:00Z",
  "venue": { "name": "...", "city": "...", "country": "...", "tz": "Australia/Melbourne" },
  "broadcast": "ESPN / ABC (US)",
  "source": "jolpica-f1",
  "source_url": "https://en.wikipedia.org/wiki/2026_Australian_Grand_Prix"
}
```

## Known gaps

- **Broadcast info** is a manual default — no free sports API provides it. F1 US
  rights are ESPN's; set in `scripts/fetch-f1.mjs`.
- **2026 F1 calendar** is only partially published upstream (~12 rounds so far);
  re-run the fetch later to pick up the rest.

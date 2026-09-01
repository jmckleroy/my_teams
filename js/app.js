/* Renders the sports calendar from window.SPORTS_CALENDAR_DATA (data/events.js).
 * Vanilla JS, no build step. Phase 1. */

(function () {
  "use strict";

  var VIEWER_TZ = "America/Chicago";
  var data = window.SPORTS_CALENDAR_DATA;

  var eventsEl = document.getElementById("events");
  var filtersEl = document.getElementById("filters");
  var generatedEl = document.getElementById("generated");

  if (!data || !Array.isArray(data.events)) {
    eventsEl.textContent =
      "No data found. Run `npm run fetch:f1` to generate data/events.js.";
    return;
  }

  VIEWER_TZ = data.viewer_tz || VIEWER_TZ;
  var activeTeam = "all";

  function fmt(iso, tz) {
    var d = new Date(iso);
    var parts = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: tz,
    }).format(d);
    return parts;
  }

  function dayKey(iso) {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: VIEWER_TZ,
    }).format(new Date(iso));
  }

  function dayHeading(iso) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: VIEWER_TZ,
    }).format(new Date(iso));
  }

  function renderFilters() {
    var teams = ["all"].concat(
      data.events
        .map(function (e) {
          return e.team;
        })
        .filter(function (v, i, a) {
          return a.indexOf(v) === i;
        })
    );
    filtersEl.innerHTML = "";
    teams.forEach(function (team) {
      var btn = document.createElement("button");
      btn.className = "filter" + (team === activeTeam ? " active" : "");
      btn.textContent = team === "all" ? "All teams" : team;
      btn.addEventListener("click", function () {
        activeTeam = team;
        renderFilters();
        renderEvents();
      });
      filtersEl.appendChild(btn);
    });
  }

  function renderEvents() {
    var now = Date.now();
    var list = data.events.filter(function (e) {
      return activeTeam === "all" || e.team === activeTeam;
    });

    if (!list.length) {
      eventsEl.innerHTML = "<p>No events.</p>";
      return;
    }

    var html = "";
    var lastDay = null;
    list.forEach(function (e) {
      var k = dayKey(e.start_utc);
      if (k !== lastDay) {
        html += '<h2 class="day">' + dayHeading(e.start_utc) + "</h2>";
        lastDay = k;
      }
      var localTime = e.venue && e.venue.tz ? fmt(e.start_utc, e.venue.tz) : null;
      var place = [e.venue && e.venue.city, e.venue && e.venue.country]
        .filter(Boolean)
        .join(", ");
      var isPast = new Date(e.start_utc).getTime() < now;

      html +=
        '<article class="event' + (isPast ? " past" : "") + '">' +
        '<div class="event-head">' +
        '<span class="badge">' + esc(e.team) + "</span>" +
        '<span class="title">' + esc(e.title) + "</span>" +
        "</div>" +
        '<dl class="event-meta">' +
        row("Competition", esc(e.competition)) +
        row("Your time", esc(fmt(e.start_utc, VIEWER_TZ))) +
        (localTime ? row("Local time", esc(localTime)) : "") +
        row("Venue", esc(e.venue && e.venue.name)) +
        row("Location", esc(place)) +
        row("TV / stream", esc(e.broadcast)) +
        "</dl>" +
        "</article>";
    });
    eventsEl.innerHTML = html;
  }

  function row(label, value) {
    if (!value) return "";
    return "<dt>" + label + "</dt><dd>" + value + "</dd>";
  }

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  if (generatedEl && data.generated) {
    generatedEl.textContent =
      "Data generated " + new Date(data.generated).toLocaleString();
  }

  renderFilters();
  renderEvents();
})();

/* Sports calendar - month grid view.
 * Reads window.SPORTS_CALENDAR_DATA (data/events.js). Vanilla JS, no build. */

(function () {
  "use strict";

  var data = window.SPORTS_CALENDAR_DATA;

  // Use whatever time zone the viewer's browser reports, so the calendar shows
  // local times for everyone. Falls back to the value baked into the data, then
  // Central, only if detection somehow fails.
  var VIEWER_TZ = detectTz() || (data && data.viewer_tz) || "America/Chicago";

  function detectTz() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch (e) {
      return null;
    }
  }

  // Friendly names for common US zones. Anything else uses the browser's own
  // long name for the zone ("Central European Standard Time"), then its city.
  var TZ_LABELS = {
    "America/Chicago": "Central Time",
    "America/New_York": "Eastern Time",
    "America/Indiana/Indianapolis": "Eastern Time",
    "America/Toronto": "Eastern Time",
    "America/Denver": "Mountain Time",
    "America/Phoenix": "Mountain Time (Arizona)",
    "America/Los_Angeles": "Pacific Time",
  };

  function tzLabel(tz) {
    if (!tz) return tz;
    if (TZ_LABELS[tz]) return TZ_LABELS[tz];
    try {
      var part = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "long",
      })
        .formatToParts(new Date())
        .find(function (p) {
          return p.type === "timeZoneName";
        });
      if (part && part.value) return part.value;
    } catch (e) {}
    return tz.split("/").pop().replace(/_/g, " ");
  }

  var TEAM_COLORS = {
    Ferrari: "#d40000",
    "FC Bayern Munich": "#dc052d",
    "Tennessee Titans": "#0c2340",
  };

  var gridEl = document.getElementById("grid");
  var monthLabelEl = document.getElementById("month-label");
  var filtersEl = document.getElementById("filters");
  var detailEl = document.getElementById("detail");
  var generatedEl = document.getElementById("generated");
  var subtitleEl = document.getElementById("subtitle");

  if (!data || !Array.isArray(data.events) || !data.events.length) {
    gridEl.textContent =
      "No data. Run `npm run fetch:f1` to generate data/events.js.";
    return;
  }

  var activeTeam = "all";
  var selectedId = null;

  // Which month to show first: the month of the next upcoming event, else the
  // month of the most recent event.
  var now = Date.now();
  var sorted = data.events.slice().sort(function (a, b) {
    return a.start_utc.localeCompare(b.start_utc);
  });
  var upcoming = sorted.find(function (e) {
    return new Date(e.start_utc).getTime() >= now;
  });
  var anchor = new Date((upcoming || sorted[sorted.length - 1]).start_utc);
  var viewYear = viewerParts(anchor).year;
  var viewMonth = viewerParts(anchor).month; // 1-12

  // ---- date helpers (all in the viewer's timezone) ----

  function viewerParts(d) {
    var p = new Intl.DateTimeFormat("en-CA", {
      timeZone: VIEWER_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    var o = {};
    p.forEach(function (x) {
      if (x.type !== "literal") o[x.type] = parseInt(x.value, 10);
    });
    return o;
  }

  function ymd(d) {
    var p = viewerParts(d);
    return (
      p.year +
      "-" +
      String(p.month).padStart(2, "0") +
      "-" +
      String(p.day).padStart(2, "0")
    );
  }

  function fmtTime(iso, tz, withZone) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: withZone ? "short" : undefined,
      timeZone: tz,
    }).format(new Date(iso));
  }

  // ---- filtering ----

  function visibleEvents() {
    return data.events.filter(function (e) {
      return activeTeam === "all" || e.team === activeTeam;
    });
  }

  function eventsByDay() {
    var map = {};
    visibleEvents().forEach(function (e) {
      var key = ymd(new Date(e.start_utc));
      (map[key] = map[key] || []).push(e);
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) {
        return a.start_utc.localeCompare(b.start_utc);
      });
    });
    return map;
  }

  // ---- rendering ----

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
      if (team !== "all") {
        btn.style.setProperty("--team", TEAM_COLORS[team] || "#555");
      }
      btn.addEventListener("click", function () {
        activeTeam = team;
        render();
      });
      filtersEl.appendChild(btn);
    });
  }

  function monthMatrix(year, month) {
    // month: 1-12. Returns array of weeks, each 7 Date-ish {y,m,d,inMonth}.
    var first = new Date(Date.UTC(year, month - 1, 1));
    var startDow = first.getUTCDay(); // 0=Sun
    var daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    var cells = [];
    for (var i = 0; i < startDow; i++) {
      var pd = new Date(Date.UTC(year, month - 1, 1 - (startDow - i)));
      cells.push({
        y: pd.getUTCFullYear(),
        m: pd.getUTCMonth() + 1,
        d: pd.getUTCDate(),
        inMonth: false,
      });
    }
    for (var day = 1; day <= daysInMonth; day++) {
      cells.push({ y: year, m: month, d: day, inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      var last = cells[cells.length - 1];
      var nd = new Date(Date.UTC(last.y, last.m - 1, last.d + 1));
      cells.push({
        y: nd.getUTCFullYear(),
        m: nd.getUTCMonth() + 1,
        d: nd.getUTCDate(),
        inMonth: false,
      });
    }
    return cells;
  }

  function render() {
    renderFilters();

    monthLabelEl.textContent = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(viewYear, viewMonth - 1, 1)));

    var byDay = eventsByDay();
    var todayKey = ymd(new Date());
    var cells = monthMatrix(viewYear, viewMonth);

    var html = "";
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (d) {
      html += '<div class="dow">' + d + "</div>";
    });

    cells.forEach(function (c) {
      var key =
        c.y + "-" + String(c.m).padStart(2, "0") + "-" + String(c.d).padStart(2, "0");
      var dayEvents = byDay[key] || [];
      var cls =
        "cell" +
        (c.inMonth ? "" : " out") +
        (key === todayKey ? " today" : "");
      html += '<div class="' + cls + '">';
      html += '<div class="date">' + c.d + "</div>";
      html += '<div class="cell-events">';
      dayEvents.forEach(function (e) {
        var color = TEAM_COLORS[e.team] || "#555";
        var past = new Date(e.start_utc).getTime() < now ? " past" : "";
        html +=
          '<button class="chip' +
          past +
          (e.id === selectedId ? " sel" : "") +
          '" style="--team:' +
          color +
          '" data-id="' +
          esc(e.id) +
          '">' +
          '<span class="chip-time">' +
          esc(
            new Intl.DateTimeFormat("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: VIEWER_TZ,
            }).format(new Date(e.start_utc))
          ) +
          "</span> " +
          esc(chipLabel(e)) +
          "</button>";
      });
      html += "</div>"; // .cell-events
      html += "</div>"; // .cell
    });

    gridEl.innerHTML = html;

    Array.prototype.forEach.call(
      gridEl.querySelectorAll(".chip"),
      function (btn) {
        btn.addEventListener("click", function () {
          selectedId = btn.getAttribute("data-id");
          render();
          renderDetail();
        });
      }
    );

    renderDetail();
  }

  var SHORT_SESSION = {
    Race: "",
    Qualifying: "Quali",
    Sprint: "Sprint",
    "Sprint Qualifying": "Sprint Q",
  };

  function chipLabel(e) {
    // Keep it short - cells are a fixed size and long labels just truncate.
    if (e.sport === "Formula 1") {
      var gp = (e.title.split(" — ")[0] || e.title).replace("Grand Prix", "GP");
      var s = SHORT_SESSION[e.session];
      return s ? gp + " · " + s : gp;
    }
    return e.short_title || e.title;
  }

  function renderDetail() {
    if (!selectedId) {
      detailEl.hidden = true;
      return;
    }
    var e = data.events.find(function (x) {
      return x.id === selectedId;
    });
    if (!e) {
      detailEl.hidden = true;
      return;
    }
    var v = e.venue || {};
    var place = [v.city, v.region || v.country].filter(Boolean).join(", ");
    var showLocal = v.tz && v.tz !== VIEWER_TZ;
    var localTime = showLocal ? fmtTime(e.start_utc, v.tz, true) : null;

    detailEl.hidden = false;
    detailEl.style.setProperty("--team", TEAM_COLORS[e.team] || "#555");
    detailEl.innerHTML =
      '<button class="detail-close" aria-label="Close">&times;</button>' +
      '<div class="detail-team">' +
      esc(e.team) +
      "</div>" +
      "<h2>" +
      esc(e.title) +
      "</h2>" +
      '<dl class="detail-meta">' +
      row("Competition", esc(e.competition)) +
      (e.session && e.title.indexOf(e.session) === -1
        ? row("Round", esc(e.session))
        : "") +
      row("Your time", esc(fmtTime(e.start_utc, VIEWER_TZ, true)) + " (" + esc(tzLabel(VIEWER_TZ)) + ")") +
      (localTime
        ? row("Local time", esc(localTime) + " (" + esc(tzLabel(v.tz)) + ")")
        : "") +
      row("Venue", esc(v.name)) +
      row("City", esc(place)) +
      row("TV / stream", esc(e.broadcast) || "TBD") +
      "</dl>";

    detailEl
      .querySelector(".detail-close")
      .addEventListener("click", function () {
        selectedId = null;
        render();
      });
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
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shiftMonth(delta) {
    viewMonth += delta;
    while (viewMonth < 1) {
      viewMonth += 12;
      viewYear -= 1;
    }
    while (viewMonth > 12) {
      viewMonth -= 12;
      viewYear += 1;
    }
    render();
  }

  document.getElementById("prev").addEventListener("click", function () {
    shiftMonth(-1);
  });
  document.getElementById("next").addEventListener("click", function () {
    shiftMonth(1);
  });
  document.getElementById("today").addEventListener("click", function () {
    var p = viewerParts(new Date());
    viewYear = p.year;
    viewMonth = p.month;
    render();
  });

  if (subtitleEl) {
    subtitleEl.innerHTML =
      "Times shown in <strong>" + esc(tzLabel(VIEWER_TZ)) + "</strong>";
  }

  if (generatedEl && data.generated) {
    generatedEl.textContent =
      "Data generated " +
      new Date(data.generated).toLocaleString() +
      " · " +
      data.count +
      " events";
  }

  render();
})();

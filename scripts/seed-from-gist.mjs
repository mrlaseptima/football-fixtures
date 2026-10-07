// One-off: converts the research gist into the initial fixtures.json (no crests, no API needed).
import { writeFileSync } from "node:fs";

const GIST = "https://gist.githubusercontent.com/ehsantg/54cb93ecee5b1b0f499fade5bb41fff6/raw";
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
// football-data.org crest ids for known clubs; others fall back to an initials badge in the page
const CREST = {
  "Manchester United": 66, Liverpool: 64, Arsenal: 57, "Manchester City": 65, Chelsea: 61,
  "Tottenham Hotspur": 73, "Real Madrid": 86, Barcelona: 81, "Atletico Madrid": 78, Sevilla: 559,
  Valencia: 95, Juventus: 109, "AC Milan": 98, "Inter Milan": 108, "AS Roma": 100, Napoli: 113,
  "Bayern Munich": 5, "Borussia Dortmund": 4, "RB Leipzig": 721, "Schalke 04": 6,
  "Paris Saint-Germain": 524, Marseille: 516, Lyon: 523, "AS Monaco": 548, Monaco: 548,
  "PSV Eindhoven": 674, Feyenoord: 675, Porto: 503, Galatasaray: 610,
};
const crest = (n) => (CREST[n] ? `https://crests.football-data.org/${CREST[n]}.png` : null);

// wall-clock time in a zone -> UTC ISO
function toUtc(y, m, d, hh, mm, zone) {
  const guess = Date.UTC(y, m, d, hh, mm);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(guess);
  const g = Object.fromEntries(parts.map((p) => [p.type, +p.value]));
  const offset = Date.UTC(g.year, g.month - 1, g.day, g.hour, g.minute) - guess;
  return new Date(guess - offset).toISOString();
}

const text = await (await fetch(GIST)).text();
const out = [];
let league = "", zone = "Europe/London";
for (const line of text.split("\n")) {
  if (/^# (Premier League|La Liga|Serie A|Bundesliga|Ligue 1)/.test(line)) league = line.slice(2).trim();
  else if (/^# UEFA Champions League/.test(line)) league = "Champions League";
  if (!line.startsWith("|") || /^\|[- |]+\|$/.test(line) || /^\| Date/.test(line)) continue;
  const c = line.split("|").slice(1, -1).map((s) => s.trim());
  let date, time, home, away, comp;
  if (league === "Champions League") {
    [date, time] = c; home = c[2].replace(/ \(.*\)$/, ""); away = c[3].replace(/ \(.*\)$/, ""); comp = "Champions League";
    zone = "Europe/Paris";
  } else {
    [date, time] = c; [home, away] = c[2].split(" vs "); comp = c[3]; zone = league === "Premier League" ? "Europe/London" : "Europe/Paris";
  }
  let y, m, d;
  const iso = date.match(/^(\d{4})-(\d\d)-(\d\d)/);
  if (iso) { y = +iso[1]; m = +iso[2] - 1; d = +iso[3]; }
  else {
    const dm = date.match(/(\d{1,2})(?:-\d{1,2})? (\w{3}) (\d{4})/) || date.match(/~(\d{1,2}) (\w{3}) (\d{4})/);
    if (!dm) continue;
    d = +dm[1]; m = MONTHS[dm[2]]; y = +dm[3];
  }
  if (/TODAY/.test(date)) continue; // already played snapshot day
  const tm = time.match(/^(\d{1,2}):(\d\d)/);
  const confirmed = !!tm && !/unconfirmed/.test(time) && !/standard slot/.test(time);
  const utc = tm ? toUtc(y, m, d, +tm[1], +tm[2], zone) : toUtc(y, m, d, 12, 0, zone);
  out.push({ kickoff: utc, timeConfirmed: confirmed, home: { name: home, crest: crest(home) }, away: { name: away, crest: crest(away) }, important: true, competition: comp.replace(/ MD\d+$/, "").replace(/,.*$/, "") });
}
out.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
const key = (m) => `${m.kickoff.slice(0, 10)}|${m.home.name}|${m.away.name}`;
const uniq = [...new Map(out.map((m) => [key(m), m])).values()];
writeFileSync("fixtures.json", JSON.stringify({ updated: new Date().toISOString(), source: "gist-seed", matches: uniq }, null, 1));
console.log(uniq.length, "matches");

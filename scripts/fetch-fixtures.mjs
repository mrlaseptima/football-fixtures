// Pulls upcoming matches for the tracked clubs from football-data.org and rewrites fixtures.json.
// Needs env FOOTBALL_DATA_TOKEN. On any failure it exits non-zero and leaves fixtures.json untouched.
import { readFileSync, writeFileSync } from "node:fs";

const token = process.env.FOOTBALL_DATA_TOKEN;
if (!token) throw new Error("FOOTBALL_DATA_TOKEN missing");

const COMPS = { PL: "Premier League", PD: "La Liga", SA: "Serie A", BL1: "Bundesliga", FL1: "Ligue 1", CL: "Champions League" };
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const TRACKED = ["manchester united", "liverpool", "arsenal", "manchester city", "chelsea", "tottenham", "real madrid", "barcelona", "atletico", "sevilla", "valencia", "juventus", "milan", "inter", "roma", "napoli", "bayern", "dortmund", "leipzig", "schalke", "paris saint", "marseille", "lyon", "monaco"];
const tracked = (n) => TRACKED.some((t) => norm(n).includes(t));

const matches = [];
for (const [code, name] of Object.entries(COMPS)) {
  const res = await fetch(`https://api.football-data.org/v4/competitions/${code}/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED`, { headers: { "X-Auth-Token": token } });
  if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
  for (const m of (await res.json()).matches) {
    if (!m.homeTeam.name || !m.awayTeam.name) continue; // TBD knockout slots
    if (!tracked(m.homeTeam.name) && !tracked(m.awayTeam.name)) continue;
    matches.push({
      kickoff: new Date(m.utcDate).toISOString(),
      timeConfirmed: m.status === "TIMED" || m.status === "IN_PLAY" || m.status === "PAUSED",
      home: { name: m.homeTeam.shortName || m.homeTeam.name, crest: m.homeTeam.crest },
      away: { name: m.awayTeam.shortName || m.awayTeam.name, crest: m.awayTeam.crest },
      competition: name,
    });
  }
  await new Promise((r) => setTimeout(r, 7000)); // free tier: 10 req/min
}
matches.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
const next = JSON.stringify({ source: "football-data.org", matches }, null, 1);
const prev = JSON.parse(readFileSync("fixtures.json", "utf8"));
// only stamp `updated` when content changed, so the Action doesn't commit every run
if (JSON.stringify({ source: prev.source, matches: prev.matches }, null, 1) !== next) {
  writeFileSync("fixtures.json", JSON.stringify({ updated: new Date().toISOString(), source: "football-data.org", matches }, null, 1));
  console.log("updated", matches.length);
} else console.log("no change");

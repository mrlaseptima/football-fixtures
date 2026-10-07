// Pulls all upcoming matches from football-data.org and rewrites fixtures.json.
// Needs env FOOTBALL_DATA_TOKEN. On any failure it exits non-zero and leaves fixtures.json untouched.
import { readFileSync, writeFileSync } from "node:fs";

const token = process.env.FOOTBALL_DATA_TOKEN;
if (!token) throw new Error("FOOTBALL_DATA_TOKEN missing");

const COMPS = { PL: "Premier League", PD: "La Liga", SA: "Serie A", BL1: "Bundesliga", FL1: "Ligue 1", CL: "Champions League" };
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const TRACKED = ["manchester united", "liverpool", "arsenal", "manchester city", "chelsea", "tottenham", "real madrid", "barcelona", "atletico", "sevilla", "valencia", "juventus", "milan", "inter", "roma", "napoli", "bayern", "dortmund", "leipzig", "schalke", "paris saint", "marseille", "lyon", "monaco"];
const tracked = (n) => TRACKED.some((t) => norm(n).includes(t));

// Optional competitions: only on paid football-data.org plans (free key gets 403 and they are skipped).
// Codes are discovered by name from /v4/competitions instead of hard-coded.
const OPTIONAL = [
  [/europa league/i, "Europa League"], [/^fa cup$/i, "FA Cup"], [/copa del rey/i, "Copa del Rey"],
  [/coppa italia/i, "Coppa Italia"], [/dfb.?pokal/i, "DFB-Pokal"], [/coupe de france/i, "Coupe de France"],
  [/^(efl|league) cup$/i, "EFL Cup"],
];
const get = (path) => fetch(`https://api.football-data.org/v4/${path}`, { headers: { "X-Auth-Token": token } });
const pause = () => new Promise((r) => setTimeout(r, 7000)); // free tier: 10 req/min

const comps = Object.entries(COMPS).map(([code, name]) => ({ code, name, required: true }));
const list = await get("competitions");
if (list.ok) {
  for (const c of (await list.json()).competitions) {
    const hit = OPTIONAL.find(([re]) => re.test(c.name) && !/conference/i.test(c.name));
    if (hit && !comps.some((x) => x.name === hit[1])) comps.push({ code: c.code, name: hit[1], required: false });
  }
}
await pause();

const matches = [];
for (const { code, name, required } of comps) {
  const res = await get(`competitions/${code}/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED`);
  if (!res.ok) {
    if (required) throw new Error(`${code}: HTTP ${res.status}`);
    console.warn(`skipped ${name} (${code}): HTTP ${res.status}, not on this plan`);
    await pause();
    continue;
  }
  for (const m of (await res.json()).matches) {
    if (!m.homeTeam.name || !m.awayTeam.name) continue; // TBD knockout slots
    matches.push({
      kickoff: new Date(m.utcDate).toISOString(),
      timeConfirmed: m.status === "TIMED" || m.status === "IN_PLAY" || m.status === "PAUSED",
      home: { name: m.homeTeam.shortName || m.homeTeam.name, crest: m.homeTeam.crest },
      away: { name: m.awayTeam.shortName || m.awayTeam.name, crest: m.awayTeam.crest },
      competition: name,
      important: tracked(m.homeTeam.name) || tracked(m.awayTeam.name),
    });
  }
  await pause();
}
matches.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
const next = JSON.stringify({ source: "football-data.org", matches }, null, 1);
const prev = JSON.parse(readFileSync("fixtures.json", "utf8"));
// only stamp `updated` when content changed, so the Action doesn't commit every run
if (JSON.stringify({ source: prev.source, matches: prev.matches }, null, 1) !== next) {
  writeFileSync("fixtures.json", JSON.stringify({ updated: new Date().toISOString(), source: "football-data.org", matches }, null, 1));
  console.log("updated", matches.length);
} else console.log("no change");

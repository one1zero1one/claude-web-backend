#!/usr/bin/env node
// Claude Code <-> browser, smallest form. Plain Node 20+, no dependencies.
//
//   serve [port]  serve page.html on 127.0.0.1 (a free port unless given); append each POST /event
//                 to events.jsonl AND print it to stdout (this process is the agent's Monitor command)
//   pending       print every event whose seq is past state.json's "handled" (replay after a restart)
//
// Files, next to this script: state.json   written only by the agent; the page polls it
//                             events.jsonl appended only by this server, one line per event
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(HERE, "state.json");
const EVENTS = path.join(HERE, "events.jsonl");
const TYPES = ["click"]; // the only event types the page may send; anything else is rejected

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
const events = () => (fs.existsSync(EVENTS) ? fs.readFileSync(EVENTS, "utf8") : "").split("\n").filter(Boolean).map((l) => JSON.parse(l));

function serve(port) {
  let seq = events().reduce((m, e) => Math.max(m, e.seq), 0);
  let lastGood = { count: 0, handled: 0 }; // state.json may be caught mid-write: serve the last parse that worked
  let origins = [];
  const reply = (res, code, body, type = "application/json") => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(body); };

  const srv = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") return reply(res, 200, fs.readFileSync(path.join(HERE, "page.html")), "text/html; charset=utf-8");
    if (req.method === "GET" && req.url === "/state") return reply(res, 200, JSON.stringify(lastGood = readJson(STATE, lastGood)));
    if (req.method !== "POST" || req.url !== "/event") return reply(res, 404, '{"error":"not found"}');
    // Every printed line reaches the agent as user input, so only this page may send one:
    // browsers set Origin on a POST, and another site's Origin is refused (curl sends none).
    if (req.headers.origin && !origins.includes(req.headers.origin)) return reply(res, 403, '{"error":"cross-origin"}');
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let type;
      try { type = JSON.parse(body).type; } catch {}
      if (!TYPES.includes(type)) return reply(res, 400, '{"error":"unknown event type"}');
      const line = JSON.stringify({ type, seq: ++seq, at: new Date().toISOString() });
      fs.appendFileSync(EVENTS, line + "\n");
      process.stdout.write(line + "\n"); // this is what wakes the agent
      reply(res, 200, JSON.stringify({ seq }));
    });
  });
  srv.listen(Number(port) || 0, "127.0.0.1", () => {
    const { port } = srv.address();
    origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
    console.log(JSON.stringify({ type: "ready", url: origins[0] + "/" }));
  });
}

function pending() {
  const handled = readJson(STATE, {}).handled || 0;
  for (const e of events()) if (e.seq > handled) console.log(JSON.stringify(e));
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "serve") serve(arg);
else if (cmd === "pending") pending();
else { console.error("usage: server.mjs serve [port] | pending"); process.exit(2); }

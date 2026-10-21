# claude-web-backend

The smallest loop between Claude Code and a browser page: a page you click, an agent that
reacts. `web-backend` shows "Hello world", a counter and one button. Each press reaches
Claude in the terminal as user input; Claude raises the counter and the page shows it.

It is the core of [grill-with-ui](https://github.com/jasonku09/grill-with-ui) by
[Jason Ku](https://github.com/jasonku09), with everything grill-specific taken out. All
credit for the design goes there.

## How it works

```
page ──POST /event──▶ server.mjs ──append──▶ events.jsonl
                          │
                          └──stdout line──▶ Monitor ──wakes──▶ Claude Code
page ◀──GET /state (1s)── server.mjs ◀──read── state.json ◀──write── Claude Code
```

- **page → agent.** The page POSTs `{"type":"click"}`. The server appends one line,
  `{"type":"click","seq":3,"at":"…"}`, to `events.jsonl` and prints the same line. Claude Code
  runs the server under a persistent Monitor, so each printed line wakes the agent. The skill's
  *event rule* tells the agent to treat that line as user input and act on it at once.
- **agent → page.** The agent writes `state.json`; the page polls it every second and
  re-renders.
- **Replay.** Events carry a `seq`; `state.json` carries `handled`, the last seq the agent
  processed. A restarted agent runs `server.mjs pending` to get the presses it missed. The
  page keeps the button disabled until `handled` reaches the seq of its last press.

### The two-file contract

| File           | Written by                     | Read by                          |
| -------------- | ------------------------------ | -------------------------------- |
| `state.json`   | the agent, and nothing else    | the page (via `GET /state`)      |
| `events.jsonl` | the server, and nothing else   | the agent (`pending`), on resume |

Neither side ever writes the other's file, so there is nothing to lock or merge. Both files
sit next to `server.mjs` and are gitignored.

The server binds to `127.0.0.1` only, and because every printed line becomes user input, it
refuses a POST from any other origin and prints only event types it knows (`click`). Keep both
checks when you extend it.

## Files

- `server.mjs`: `serve [port]` serves the page on a free port (or the port given, to keep an
  open tab alive across a restart); `pending` prints events past `handled`. No dependencies,
  Node 20+.
- `page.html`: the page.
- `SKILL.md`: the skill. It starts the server in a Monitor, opens the URL, and per press
  writes `state.json` with one `echo` and replies with one terminal line.

## Install

```sh
ln -s ~/repo/mine/claude-web-backend ~/.claude/skills/web-backend
```

Start a new Claude Code session and run `/web-backend`.

The Monitor runs with the longest timeout (30 minutes) and is re-armed with `serve <port>` on
expiry, so the open tab survives. Where Monitor offers `persistent: true`, the skill uses that.

## Extending it into a real skill

grill-with-ui is the worked example. It keeps this loop and grows each piece:

- **Richer events.** One `send` event carries a batch of `actions` (answers, thread messages)
  instead of a bare click, so the agent wakes once per decision rather than once per keystroke.
- **Richer state, written by patch.** Its state grows to dozens of questions, so the agent
  never writes it whole. A `patch` command merges a small diff, validates it and swaps the file
  in atomically, which keeps the full state out of the agent's context.
- **Agent status on the page.** `state.agent.status` (`working` / `waiting`) tells the page
  when to show a spinner.
- **Sessions.** One folder per grill, so several can run and be resumed.
- **Wait mode.** For harnesses without a Monitor, a blocking `wait` command stands in for it.

Start with the smallest version of each that you need. The loop itself stays the same.

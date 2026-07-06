#!/usr/bin/env bash
#
# run-worklist.sh — write the documentation chapters listed in WORKLIST.md to
# completion, one FRESH Claude Code session per chapter, unattended.
#
# Each iteration starts a brand-new `claude -p` session, so context never
# accumulates across chapters — all state lives in WORKLIST.md + git, which makes
# the run resumable: if it stops, just start this script again. A session killed
# mid-chapter leaves its uncommitted draft in the tree; the next session finishes
# it (see the RESUME RULE in the prompt).
#
# It does NOT push. Chapters accumulate on `main` locally so you can review them,
# then `git push` when you are happy (a push triggers the Pages deploy). Set
# PUSH=1 to push after each committed chapter instead.
#
# WARNING: runs with `--permission-mode bypassPermissions` (no prompts; it runs
# `npm run check` and `git commit` on its own, on `main`). Run it where you are
# comfortable with that.
#
# Config via env: MODEL, EFFORT, MAX_ITERS, MAX_STALLS, TASK_TIMEOUT, PUSH.
#
# Watch it live:
#   tail -f  .worklist-logs/latest.log      # heartbeat: iteration / result / commit
#   tail -F  .worklist-logs/current.log     # the session running right now

set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO" || { echo "cannot cd to repo"; exit 1; }

MODEL="${MODEL:-claude-opus-4-8}"
EFFORT="${EFFORT:-high}"
MAX_ITERS="${MAX_ITERS:-40}"
MAX_STALLS="${MAX_STALLS:-3}"
TASK_TIMEOUT="${TASK_TIMEOUT:-2400}"
PUSH="${PUSH:-0}"

command -v claude >/dev/null || { echo "claude CLI not on PATH"; exit 1; }
[[ -f WORKLIST.md ]] || { echo "WORKLIST.md not found in $REPO"; exit 1; }
[[ -d node_modules ]] || { echo "installing dependencies..."; npm install >/dev/null 2>&1 || { echo "npm install failed"; exit 1; }; }

LOG_DIR="$REPO/.worklist-logs"
mkdir -p "$LOG_DIR"
RUN_TS="$(date +%Y%m%d-%H%M%S)"
MASTER_LOG="$LOG_DIR/run-$RUN_TS.log"
ln -sf "run-$RUN_TS.log" "$LOG_DIR/latest.log"
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$MASTER_LOG"; }
open_count() { grep -c '^- \[ \] \*\*[TLMR]' WORKLIST.md 2>/dev/null || echo 0; }
done_count() { grep -c '^- \[x\]' WORKLIST.md 2>/dev/null || echo 0; }

read -r -d '' PROMPT <<'EOF'
You are writing ONE chapter of the Jenesis documentation site in this repository (jenesis-documentation).

1. Read WORKLIST.md — in particular the "Writing conventions". Pick the FIRST unchecked chapter task
   (a line like "- [ ] **T3 · Core concepts** — …") in file order. Work only that one chapter.

2. SOURCE IT (writing convention #1, non-negotiable): read the relevant project's README.md in full, and —
   for the tool section — the demo/*/README.md files it cross-links. The sibling projects are checked out
   next to this one: ../jenesis (the build tool and its demo/ folder), ../jenesis-launcher,
   ../jenesis-modules, ../jenesis-repository. Pull EVERY piece of end-user information for this chapter's
   topic into the chapter so nothing is lost as the READMEs are shortened. Leave developer/internal detail
   in the README — this is user documentation, not developer documentation.

3. WRITE the chapter as one Markdown file at src/<section>/<slug>.md (section = tool | launcher | modules |
   repository; slug a short kebab-case name). Front matter: `order` (the chapter number from the worklist),
   `title`, `description`. Follow the conventions: build from zero knowledge, stay focused (short sections,
   no wall of text), use code blocks and note/tip/warning admonitions, and add a `tip` linking the demos the
   worklist tagged for this chapter. Repository chapters go capability(SPI) → implementations → settings.

4. VERIFY: run `npm run check` (Eleventy build + hyperlink link/asset/fragment validation). It MUST pass;
   fix anything it reports.

5. COMMIT: commit the new file and, in the SAME commit, flip that task's "- [ ]" to "- [x]" in WORKLIST.md.
   Commit only the files you created or modified for this chapter. Do NOT push.

RESUME RULE: if the working tree already holds an uncommitted, half-written chapter from a killed session,
finish and commit THAT chapter instead of starting a new one.

Stop after exactly one chapter is committed. Do not start a second chapter.
EOF

log "docs worklist run start — model=$MODEL effort=$EFFORT cap=$MAX_ITERS push=$PUSH  ($(done_count) done, $(open_count) open)"

stalls=0
for ((i = 1; i <= MAX_ITERS; i++)); do
  [[ "$(open_count)" -eq 0 ]] && { log "all chapters written 🎉"; break; }
  before="$(git rev-parse HEAD)"
  iter_log="iter-$RUN_TS-$(printf %03d "$i").log"
  ln -sf "$iter_log" "$LOG_DIR/current.log"
  log "iteration $i/$MAX_ITERS — $(done_count) done, $(open_count) open  →  $iter_log"

  timeout "$TASK_TIMEOUT" claude -p "$PROMPT" --model "$MODEL" --effort "$EFFORT" \
      --permission-mode bypassPermissions --output-format stream-json --verbose </dev/null \
      > "$LOG_DIR/$iter_log" 2>&1

  after="$(git rev-parse HEAD)"
  if [[ "$before" == "$after" ]]; then
    stalls=$((stalls + 1))
    log "no new commit (stall $stalls/$MAX_STALLS)"
    [[ $stalls -ge $MAX_STALLS ]] && { log "stalled $MAX_STALLS× — stopping (check $iter_log)"; break; }
  else
    stalls=0
    log "committed: $(git log -1 --oneline | cut -c1-80)"
    [[ "$PUSH" == "1" ]] && { git push >/dev/null 2>&1 && log "pushed"; }
  fi
done

log "run end — $(done_count) done, $(open_count) open"

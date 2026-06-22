---
name: Background processes are reaped between tool calls
description: Long one-shot scripts must run as a console workflow, not a detached bash process — the environment kills detached processes when the launching tool call returns.
---

# Background processes are reaped the moment the launching tool call returns

Detaching a long-running process from a `bash` tool call does NOT survive into the
next tool call. `setsid bash -c '… &' </dev/null & disown` and `nohup … &` both
get killed almost immediately after the launching tool call returns. Verified with
a trivial `node` heartbeat that wrote a file every 5s — it never produced a single
tick across tool calls.

**Why:** the platform reaps processes that aren't managed by a workflow once the
shell that launched them exits with the tool call. A process only *appears* to
survive if you keep the launching call alive (e.g. `sleep N` in the same call).

**How to apply:** for any one-shot job longer than the ~2-min `bash` cap (or the
code_execution sandbox cap):
- Run it as a temporary workflow: `configureWorkflow({ name, command,
  outputType: "console" })` (no `waitForPort` for a non-server script — it will
  end in state `finished`). Workflow-managed processes survive across tool calls.
- Poll progress via `getWorkflowStatus` and/or a file the script writes; console
  output is block-buffered so file-based progress is more reliable mid-run.
- `removeWorkflow` when finished so it isn't auto-restarted on package installs.
- Make the job **resumable** (persist incremental progress, skip completed units
  on restart) so a reap/restart continues instead of starting over. Do NOT rely on
  `restart_workflow` for a non-serving script — it can SIGKILL after its
  serving-detection timeout.

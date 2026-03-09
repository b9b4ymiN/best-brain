# best-brain Final Concept

## Core statement

`best-brain` is a local AI work operating system that embodies the user's persona, manages missions, and delegates execution to specialized workers until the work is actually complete.

Thai framing:

`best-brain` คือระบบปฏิบัติการ AI บนเครื่อง ที่มีตัวตนเป็นเจ้าของ คิดแบบเจ้าของ คุมงานแบบเจ้าของ และใช้ทีม worker ทำงานแทนเจ้าของจนเสร็จจริง

## What it is

`best-brain` is meant to be:

- `AI Persona`: remembers how the owner thinks, decides, reports, and judges quality
- `Mission Manager`: accepts goals, decomposes work, dispatches workers, and closes loops
- `Worker Swarm`: uses replaceable specialist workers such as Claude Code, Codex, Browser, Shell, Mail, and Verifier
- `Local Runtime`: acts on the user's machine through files, processes, browser automation, artifacts, and checkpoints
- `Control Surface`: exposes UI and operator paths for starting, inspecting, and approving work

## What it is not

`best-brain` is not:

- a normal chatbot
- a thin Claude Code wrapper
- a thin Codex wrapper
- a generic orchestration tool
- a system where one model thinks, acts, and verifies alone
- a system that claims work is done without proof

## Non-negotiable principles

- `Persona first`: before it becomes more autonomous, it must first become more like the owner
- `Mission first`: big work must be treated as missions, not as long chat turns
- `Workers are replaceable`: Claude, Codex, Browser, Shell, and Mail can change; the brain and manager are the core
- `Verification is mandatory`: completion without verification is not completion
- `Local-first`: the primary runtime must work on the user's machine
- `Progressive autonomy`: light work stays light; heavy work earns heavier planning and verification

## Required operating modes

- `Chat Mode`: fast answer, explanation, brainstorming, or summarization
- `Task Mode`: bounded work with one or two workers and light verification
- `Mission Mode`: planning, task graph, worker dispatch, review loop, repair loop, and final proof of done

## Definition of done

Work counts as done only when:

- required outputs match the brief
- relevant verification passes
- no blocking issue remains
- artifacts show that work was actually performed
- the result includes a clear summary of what was done, what remains, and what is risky

Work is not done if any of these remain true:

- build fails
- test fails
- report is incomplete
- output does not match the brief
- UI is wrong
- no credible artifact exists

## Project slogan

`Think like me. Work for me. Finish for real.`

## Guiding belief

We are not building an AI that only answers on behalf of a person.

We are building an AI that can work on behalf of the owner in a reliable, inspectable, and proof-driven way.

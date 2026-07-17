# Trace Sessions — beta validation (owner playbook)

**Goal:** real evidence that developers will pay €9.99 for Trace Sessions. Compliments,
stars and "I would pay" do not count. Payments (or clearly disclosed refundable
pre-orders) count.

## Recruiting 15 qualified testers

Qualified = uses Zustand in a real project at least weekly, hit a hard state bug
recently, and is not a friend being nice. Where to find them: Zustand GitHub Discussions,
r/reactjs debugging threads, Reactiflux #help-react, your Show-HN/Reddit replies. Ask two
screening questions before sending the build: "What are you building with Zustand?" and
"What was your last painful state bug?" — vague answers disqualify.

Send: the extension zip (load unpacked), `npm i zustand-devtools-bridge`, and this ask:

> Next time you're debugging real state weirdness, press Start Trace in the Zustand
> panel, reproduce it, press Stop. You get 3 full preview sessions free. Then tell me
> what happened — 10 minutes, brutal honesty wanted.

## The seven questions (ask after they used it on a real bug)

1. What were you debugging?
2. Did the trace identify useful source code (call-sites)?
3. Did the deep diff reveal something free tools didn't make obvious?
4. Did snapshot comparison help?
5. How much time did it save, honestly?
6. What remained confusing?
7. Your three previews are used — will you buy the €9.99 founding license **now**?
   (A "yes" that isn't followed by a purchase is a "no.")

## Decision rule (after 15 qualified testers)

- **Strong:** ≥3 real purchases AND ≥5 completed real debugging tasks → build the full
  Pro roadmap (Phase 3).
- **Mixed:** 1–2 purchases → fix workflow/positioning, run 15 more testers.
- **Weak:** 0 purchases → stop adding Pro features; interview users, change the paid
  problem.
- **Usage failure:** <5 testers complete a meaningful trace → fix onboarding or
  reconsider the product.

Phase 3 (session library, better source maps, HTML reports, team licenses, …) is
**blocked** until this gate returns a Strong signal.

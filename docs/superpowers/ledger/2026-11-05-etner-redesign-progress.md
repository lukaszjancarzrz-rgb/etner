# Progress ledger – redesign „Katalog techniczny”
Plan: docs/superpowers/plans/2026-11-05-etner-redesign-katalog.md · Direction contract: web/.impeccable/surfaces/src-app-tsx.md · Product: web/PRODUCT.md
Owner 2026-11-05: audit (25/40) → full redesign, direction A chosen („1 opcja jest najlepsza”); keep grid bg, „nowe” red, menu ungrouped, bigger tagline, desktop tables.
- Ruling R78: decision round done via structured question (decision page on localhost unreachable from owner's phone/web) — cost: none.
R1: dispatched (base 9fc4ebc).
Owner 2026-11-05: category tab abbreviations EL, RW (Rekuperacja), KL (Klimatyzacja), PV, AM (Alarmy i monitoring); plan R2 updated.
R1: impl b1807cf..2b06b32 (concerns: logo PNG cropped into mark+wordmark for legible tagline; theme override shrinks rounded-xl/2xl/3xl; placeholder token ink-3; navy phone top bar); review dispatched.
R1: review spec ✅ Approved — complete (9fc4ebc..2b06b32, review clean).
- Ruling R79: brief's logo numbers were contradictory (full PNG at 176–190 px cannot give a legible tagline); crop lockup (mark + wordmark) accepted — cost: owner may want original proportions (asked).
R1: minor (deferred → R3 brief): radius override, logo crop offsets, side stripes in Paszport/Samochody/Harmonogram, dark duplicate --ink-3 + theme-color, input outline contrast.
R2: dispatched.
R2: impl ac62b04..324031b; review dispatched. Controller look: Paszporty last column badge overflows table edge (to add to fixes).
R2: review spec ✅ Needs fixes: I1 opened job outside scope/filter not shown/selected in desktop table. Fix round 1 dispatched (+ Paszporty badge overflow).
- Ruling R80: Zakupy column labelled „Uwagi” (no quantity field exists) and category tab text navy where white fails contrast (e.g. amber „IN”) — accepted, truthful labels and AA contrast — cost: owner may want white text everywhere.
R2: fix round 1/5 (2 addressed, 0 open; 324031b..35cab39) — complete (52875bf..35cab39).
R2: minor (deferred): open job whose status changes while open may leave visible scope; M3 (Segmented), M6, M8, M9 from R2 review left.
R3: dispatched (incl. Leady desktop table left by R2; Harmonogram toolbar restyle; job card pills).
Owner 2026-11-05: „Więcej” last in side menu (under „Na jutro”) — controller change on working branch; ships with redesign. R3 implementer hit usage limit before any commit (resets 13:50 UTC); to resume.
Owner 2026-11-05: pause after current change (usage limit); R3 implementer told to finish bits.tsx, commit, write status, stop. Resume later: R3 remaining items + review, then R4 (screenshots, detector, finish review, DESIGN.md, release).
R3: impl 5e25e79..ed67da0 (paused): unit+build ok; full e2e run1 88/1 fail fixed in ed67da0 (menu order), re-run stopped at 45 passed. TODO on resume: one full e2e run, R3 review, then R4.
Owner 2026-11-10: use Fable model for further subagents (implementers, reviewers, finish review, documenter). Running R3 reviewer stays on its model. Full e2e for R3 running.
R3: review spec ✅ Needs fixes: I1 --field duplicated in system-dark block, missing in explicit dark. Minors M1 (pencil invisible on touch at desk), M3 (Usuń 14px gap), M6 (Motyw switch without arrow keys) folded into fix round.
- Ruling R81: font-mono kept for logins/passwords (Użytkownicy, Import) — functional: distinguishes l/1/I in credentials; global „no monospace” rule targets decoration — cost: one more face on two admin screens.
- Ruling R82: fix round 1 goes to a fresh implementer on Fable (owner asked to continue on Fable) instead of resuming the R3 implementer — cost: re-reading context.
R3: controller full e2e at 5a27e90: 87 passed, 5 skipped, 2 failed (full.spec.ts:124 date assumption — 11.11 holiday, app correct). Fix round 1 dispatched on Fable (I1, M1, M3, M6, e2e date).
R3: fix round 1/5 (4 addressed, 1 open — e2e date assertion too loose; f909041). Fix round 2 dispatched.
R3: fix round 2/5 (1 addressed, 0 open; ac69361) — complete (04295a9..ac69361). R4: final screenshots + detector dispatched (Fable).
R4: final screenshots 61 (shots/final), detector only owner grid. Finish review (Fable): disposition fix — 8 material fixes + owner decisions (PV colour = red of „nowe”, SH/SP/IN, self-host fonts). Summary in sdd finish-review.md.
Owner 2026-11-10: PV → orange #c4501b (incl. production dictionary); abbreviations SH, SP ok, Inne → „I”; self-host fonts (RODO).
- Ruling R83: /p/ customer page stays out of this redesign (it was redesigned separately as the compact „tabliczka” page; owner reviewed it) — cost: page keeps system font; can follow later.
- Ruling R84: harmonogram cell category tint kept as a cited exception to „category colour only in index tabs” (cells need the tint to scan a week) — to be written into the contract/DESIGN.md.
R4: final fix wave dispatched (Fable).
Owner 2026-11-10: optimize usage — rules from now on: subagents default to Sonnet (screenshots, tests, small fixes, scoped re-reviews, documentation); Fable/Opus only for hard multi-file implementation and the final whole-change review; small fixes get one scoped re-review only; screenshots only of changed screens (no full series); a fresh session after release. Running final fix wave stays on Fable (switching mid-way would re-read context).
R4: final fix wave a6da1c5..96c9c54 re-review (Sonnet) all addressed. Ready for release pending owner OK; DESIGN.md (documenter) after.
Owner 2026-11-10: „Tak” — redesign released to produkcja (migration 0024 data-only).
R4: DESIGN.md + .impeccable/design.json written (7a55de1). Redesign complete.

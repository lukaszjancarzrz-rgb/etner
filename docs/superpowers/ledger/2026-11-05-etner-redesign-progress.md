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

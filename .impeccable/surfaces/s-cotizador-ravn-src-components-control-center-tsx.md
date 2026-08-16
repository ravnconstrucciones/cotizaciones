---
version: 1
slug: "s-cotizador-ravn-src-components-control-center-tsx"
primary_target: "apps/cotizador-ravn/src/components/control-center.tsx"
related_targets: ["apps/cotizador-ravn/src/app/globals.css","apps/cotizador-ravn/src/domain/preview-data.ts","apps/cotizador-ravn/src/app/layout.tsx"]
---

## Scope and mode

Replacement first viewport for the standalone Cotizador RAVN workspace. Mode: Operate.

## Audience, job, and primary task

Eze uses the surface to state or clarify a construction job, understand what bounded roles have produced, answer the question currently blocking a rubro, and judge how close the quote is to a cost decision.

The primary task is conversational input. The accompanying tasks are scanning role activity, opening evidence by rubro, and resolving the next blocker. The current production contract is read-only, so the live composer must fail closed; the synthetic preview may demonstrate the input behavior locally without implying dispatch.

## Proof and content

Use the projected quote title, persisted message events, source evidence, review checks, cost range, confidence, coverage, batch blockers, and decision questions. In live mode, no station may claim running work or assignment without a persisted signal. In preview, one global PREVIEW chip covers all synthetic demonstration content.

## Chosen direction

“Expediente vivo”: a serious RAVN matter desk whose three simultaneous columns are conversation, observable team work, and quote formation. Approved north-star comp: `.impeccable/mocks/cotizador-matter-desk-c.png`. Approval was delegated through the user's explicit product model; this comp best satisfies all five first-viewport questions.

The memorable interaction is the same rubro being legible in three places at once: attached to a role's useful action, selected in the relationship canvas, and visibly filling in the quote board. A restrained circular coordinator marks the intersection but never outranks the conversation.

## Visual and interaction contract

- Matte black field, warm-white typography, steel hairlines, square panel geometry, no decorative color.
- Strong RAVN wordmark and a compact quote selector in a 64px header.
- Three columns at desktop: conversation 31–34%, team canvas 42–45%, quote formation 23–25%.
- Raleway carries all product copy. Tabular figures use the same family with numeric features; no developer-facing mono aesthetic.
- Elevation comes from spatial hierarchy, border opacity, and inversion, not shadow, glow, glass, or rounded floating cards.
- Framer Motion only for real selection, message insertion in preview, details reveal, and responsive view transitions. No orbit, pulse, typing theater, or ambient motion.
- At mobile widths, use three explicit tabs: Conversar, Equipo, Cotización. Do not compress all columns into an unreadable mini-dashboard.

## Comp inventory and implementation medium

| Ingredient | Commitment | Medium |
|---|---|---|
| Branded header | RAVN wordmark dominates; quote and preview state remain compact | Semantic HTML/CSS; Lucide controls |
| Conversation desk | Large prompt, concise thread, always-visible composer | Semantic HTML form; local preview state only; live disabled |
| Team stations | Four bounded roles, useful action, artifact/evidence, affected rubro | Semantic HTML from snapshot; no portraits or invented people |
| Coordinator | Modest circular R mark at the relationship intersection | Authored CSS/SVG geometry |
| Relationships | Lines only when evidence/message/check maps to a real rubro | Responsive SVG; Framer Motion state transition |
| Rubro formation rail | Up to five real batches, coverage fill, blocker, selection | Buttons and CSS progress; text and line state, not color-only |
| Quote board | Cost range, confidence, coverage, rubro readiness | Semantic HTML from deterministic projection |
| Question for Eze | One primary question beside its affected rubro | Accessible callout and disabled/live-safe action |
| Event chronology | Two or three latest persisted transitions, subordinate to work | Compact internal list; full chronology in details |
| Technical truth | Checks, evidence, gaps, jobs/budget absence, handoff lock | Native details below first viewport; collapsed by default |
| Approved comp | Direction and density reference only; not a shipped screenshot | Design reference; no raster UI shipped |

## What must not be literalized from the comp

Do not use invented personal names, portraits, customer identities, files, prices, percentages, active-agent counts, or “running” states. Do not enable proposal generation or final confirmation. Do not turn the coordinator into a decorative hero orb. All visible content comes from the snapshot or the explicitly synthetic preview fixture.

## Unresolved decisions

- The production write contract for conversational intake and follow-up answers does not exist yet.
- Durable role assignments, job runtime, per-agent heartbeat, bounded credit accounting, and proposal/handoff writes remain uninstrumented.
- A later integration must decide whether the conversation owns a new quote before or after App RAVN allocates an external quote identifier.

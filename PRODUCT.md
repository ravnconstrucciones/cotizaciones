# Cotizador RAVN

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Ezequiel Otero is the primary user. He quotes construction and renovation work from a desktop or mobile browser while coordinating scope, technical method, market prices, supplier evidence, costs, margin, and the final commercial proposal.

## Product Purpose

Cotizador RAVN is the separate thinking and research environment for a quote. Eze describes the job conversationally, answers follow-up questions, watches bounded research roles work, and sees evidence consolidate into quote batches. Success means the system makes the current work, missing answers, evidence coverage, cost range, and next decision obvious without inventing activity.

App RAVN remains the operational system of record for projects, expenses, works, collections, and the final approved quote record. Cotizador RAVN owns diagnosis, research, evidence, deterministic cost modeling, margin decision support, and proposal preparation before handoff.

## Positioning

The product combines a conversational quotation desk with observable, evidence-linked work by explicit roles. Research does not disappear behind a generic answer: each finding belongs to a source and an affected rubro, and the quote forms visibly as those rubros become ready for decision.

## Operating Context

The intended flow is: Eze enters a request or answers a follow-up; an orchestrator identifies parallel and blocked work; bounded roles research methods, local prices, SISMAT, and source evidence; deterministic code performs quantities and cost checks; findings attach to rubros; Eze approves the final number and margin; only then may proposal preparation and a minimal traceable handoff to App RAVN become available.

The first production subsystem currently reads legacy quote data from App RAVN through a server-only GET adapter. It projects persisted quote rows, evidence, messages, checks, and bridge heartbeat into a truthful workspace. It does not yet own a writable conversation endpoint, a durable job queue, per-agent runtime telemetry, credit accounting, proposal generation, or App RAVN handoff.

## Capabilities and Constraints

- Reuse the existing deterministic quotation engine and its data contracts; do not replace arithmetic with model inference.
- Display only persisted evidence, messages, checks, sources, and observed connectivity in live mode.
- Preview data may demonstrate the interaction model only when labeled once as synthetic.
- Internal implementation labels, private model reasoning, fake terminal output, fake agents, and ambient activity are not user-facing product content.
- When live contracts cannot establish queue, running state, budget, assignment, or per-agent progress, represent the absence compactly and keep actions disabled.
- Agents are bounded roles. Their visible output is concise user-relevant work, evidence, artifacts, files, actions, diffs, or task progress where available, never hidden chain-of-thought.
- Margin and final price require Eze's explicit approval. Proposal preparation and App RAVN synchronization stay locked before that decision.
- The read adapter must remain server-only and fail closed. No production mutation, push, deploy, or integration is part of this visual redesign.

## Brand Commitments

The product name is Cotizador RAVN and the RAVN wordmark must be unmistakable. Brand identity is black `#070707`, warm white `#f2efe8`, steel hairlines, square geometry, and Raleway. The product is austere, precise, elegant, and serious; it never calls itself premium. The standalone cotizador must feel authored and distinct from App RAVN while remaining recognizably RAVN.

The interaction reference is a lucid, high-end legal or operations AI workspace: conversational, task-first, and calm under dense work. The control-center reference may use a central coordinator and visible relations, but not literal blue sci-fi, decorative orbiting, glow-heavy cyberpunk, or fake activity.

## Evidence on Hand

- Deterministic quotation engine and tests under `src/lib/cotizador/`.
- Standalone projection, read-only adapter, authentication, and preview fixture under `apps/cotizador-ravn/`.
- Persisted quote rows may contain item breakdowns, price origins and dates, review checks, sanity findings, doubts, and legacy messages.
- A local SISMAT dataset exists outside this app, but the v1 workspace only claims SISMAT evidence when it is present in persisted quote data.
- There is no production contract yet for durable batches/jobs, assignments, budget, per-agent execution, writable chat, proposal generation, or final handoff. The interface must not imply those exist.

## Product Principles

1. Conversation is the front door; Eze should always know where to state the job or answer the system.
2. Work is observable through useful actions and artifacts, not private reasoning or theatrical telemetry.
3. Evidence belongs to a rubro; progress means the quote is actually becoming decision-ready.
4. Absence is explicit but quiet. Missing instrumentation must not dominate the work surface.
5. Human approval separates cost readiness, margin decision, proposal preparation, and operational handoff.

## Accessibility & Inclusion

The interface must remain keyboard usable, expose visible focus, maintain 44px touch targets on mobile, preserve meaning without color alone, and honor reduced-motion preferences. Spanish is the product language.

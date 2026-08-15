---
name: Cotizador RAVN
description: A precision quotation desk where conversation, dual-model evidence, and rubro formation stay visibly connected.
colors:
  raven-black: "#070707"
  panel-black: "#0a0a0a"
  steel-surface: "#0e0e0d"
  steel-surface-strong: "#151514"
  warm-white: "#f2efe8"
  quiet-steel: "#b7b3ab"
  dim-steel: "#918e87"
  hairline: "rgb(242 239 232 / 0.12)"
  hairline-strong: "rgb(242 239 232 / 0.28)"
typography:
  display:
    fontFamily: "Raleway, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.45rem, 2vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Raleway, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.22rem, 1.7vw, 1.68rem)"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Raleway, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Raleway, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.62rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  square: "0px"
  circle: "50%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
components:
  action-inverse:
    backgroundColor: "{colors.warm-white}"
    textColor: "{colors.raven-black}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "12px 16px"
  action-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.warm-white}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "12px 16px"
  status-chip:
    backgroundColor: "transparent"
    textColor: "{colors.warm-white}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "6px 10px"
  panel:
    backgroundColor: "{colors.panel-black}"
    textColor: "{colors.warm-white}"
    rounded: "{rounded.square}"
    padding: "16px"
---

# Design System: Cotizador RAVN

## Overview

**Creative North Star: "The Precision Matter Desk"**

Cotizador RAVN is a calm operational surface made from raven black, warm white, steel planes, and exact hairlines. It feels advanced because relationships and state are legible, not because the interface performs science fiction. Conversation is the front door; Codex and Fable visibly examine the same request; evidence attaches to rubros; the cost forms at the edge of the same workspace.

The system is dense but disciplined. A three-column desktop field holds the conversation, comparison, and forming quote at once. Inversion is rare and meaningful: warm white on black identifies the current decision or active control. Motion is short, event-driven, and removable.

**Key Characteristics:**

- Square steel planes divided by hairlines rather than floating cards.
- Raleway throughout, with tabular numerals for money and telemetry.
- One unmistakable RAVN wordmark and one subtle preview marker.
- Visible connections represent persisted relationships, never ambient activity.
- Technical caveats remain available but quiet and secondary.

## Colors

The palette is monochrome and warm: four near-black material depths, one warm white, two steel text tones, and translucent white hairlines.

### Primary

- **Raven Black:** the uninterrupted product ground and dominant material.
- **Warm White:** primary text, selected states, focus, and rare decision inversion.

### Neutral

- **Panel Black:** column and container planes.
- **Steel Surface:** fields and contained work items.
- **Strong Steel Surface:** selected or raised-within-plane state.
- **Quiet Steel:** supporting copy and secondary status.
- **Dim Steel:** timestamps, metadata, and unavailable state.
- **Hairlines:** structure, separation, and relationship geometry.

### Named Rules

**The One Inversion Rule.** Warm-white fill is reserved for the selected control or the decision that needs Eze; it must not become general decoration.

**The Truth Has No Glow Rule.** State is expressed with words, line weight, fill, and shape. Never add colored status glows or animated energy.

## Typography

**Display Font:** Raleway with Helvetica Neue and Arial fallback  
**Body Font:** Raleway with Helvetica Neue and Arial fallback  
**Label Font:** Raleway with tabular numerals enabled where values change

**Character:** A single geometric family keeps the workspace authored and austere. Tight display tracking gives cost and stage precision; small uppercase labels create a measured instrument language without adopting a novelty techno face.

### Hierarchy

- **Display** (600, fluid 1.45rem–2rem, 1.05): cost ranges and the strongest decision value.
- **Headline** (600, fluid 1.22rem–1.68rem, 1.12): the conversation prompt and section-level operational questions.
- **Body** (400, 15px, 1.45): messages, findings, questions, and evidence descriptions.
- **Label** (600, approximately 0.62rem, 0.12em tracking): modes, states, timestamps, and compact controls.

### Named Rules

**The Human First Rule.** The largest language describes the job, question, or money decision. Internal system terminology never earns headline scale.

## Layout

Desktop is a full-height three-column matter desk beneath a 64px global header: conversation on the left, dual-model comparison and synthesis in the center, and the forming quote on the right. Column boundaries are structural hairlines, not card gutters. The workspace targets a minimum 760px operational height and caps its span at 1920px.

Below 1260px, the quote formation moves beneath the conversation/comparison field. Below 900px, three 44px mobile tabs expose Conversar, Equipo, and Cotización without squeezing the desktop diagram. Below 560px, dense grids become single columns and the page uses normal document scroll. The minimum supported width is 320px.

Spacing follows an 8px base with 12px, 16px, and 20px working increments. Touch actions remain at least 44px.

## Elevation & Depth

The system uses no conventional card shadows. Depth comes from stepped near-black materials, hairline strength, selection inversion, and nested planar boundaries. The synthesis circle is a relational landmark, not a floating glass object.

### Named Rules

**The Planes Not Cards Rule.** Build hierarchy by subdividing one operational field. Do not scatter rounded, elevated cards over the canvas.

## Shapes

The default form is square with zero radius. Circles are exceptional and semantic: the central synthesis point, compact relationship markers, and status nodes. One-pixel solid and dashed lines carry structure and unknown-state distinctions.

## Components

### Buttons

- **Shape:** square, minimum 44px target.
- **Primary:** warm-white fill with raven-black text, used sparingly for a real available action.
- **Hover / Focus:** ghost controls invert to warm white; keyboard focus receives a 2px warm-white outline.
- **Disabled:** stays on the dark plane with dim steel text and reduced opacity.

### Chips

- **Style:** transparent square label with a strong hairline and wide tracking.
- **State:** one global Preview chip; rubro/state chips use text and border treatment instead of semantic color.

### Cards / Containers

- **Corner Style:** square.
- **Background:** panel black or steel surface.
- **Shadow Strategy:** none.
- **Border:** one-pixel hairline; stronger hairline marks selection or major division.
- **Internal Padding:** generally 12px–20px.

### Inputs / Fields

- **Style:** steel surface, square edge, one-pixel strong hairline, warm-white content.
- **Focus:** explicit warm-white outline; no glow.
- **Disabled:** remains readable and states why writing is unavailable.

### Navigation

The 64px header places the RAVN identity, quote selector, and truthful connection state on one grid. Mobile navigation becomes three equal-width text tabs with an inverted active tab.

### Dual-Model Synthesis

Codex and Fable receive the same matter and occupy equal lanes. Their persisted contributions connect to a central synthesis point, followed by compact agreement, complement, divergence, and shared-gap states. Sources and deterministic controls remain validation lanes, not model personas.

## Do's and Don'ts

### Do:

- **Do** make the first viewport answer where Eze speaks, what Codex and Fable contributed, what needs him, and how the quote is forming.
- **Do** attach every visible contribution and evidence item to a real persisted rubro when the contract provides that relationship.
- **Do** use Framer Motion only for selection, insertion, and real state transitions, and resolve all durations to zero for reduced motion.
- **Do** keep unavailable instrumentation concise and expandable.

### Don't:

- **Don't** show private chain-of-thought, fake terminal output, fake progress, decorative agent motion, or invented comparison results.
- **Don't** use blue sci-fi color, colored glows, glassmorphism, gradients, novelty techno fonts, rounded dashboard cards, or perpetual orbit animation.
- **Don't** let implementation labels replace job, rubro, evidence, question, and cost language.
- **Don't** repeat the Preview warning; mark the synthetic world once at product level.

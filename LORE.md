# Vextris Lore Bible

## One-Page World Frame
The Rite of Descent is practiced because it works, not because it is understood.

Every offering burned on the altar becomes **Tribute**. Tribute keeps unnamed pressures below the chamber threshold and buys passage through each **Seal**. When Tribute fails, chambers fail. Settlements remember this, even when they disagree on why.

The player is an **Augur**: not a hero, but a chosen instrument. The Augur can descend only by spending **Resolve** and accepting **Pacts** that increase ritual yield while eroding body, judgment, and environment. In Vextris, progress and damage are the same motion.

## Tone and Narrative Rules
- Keep causes obscure and effects concrete.
- Speak in ritual certainty, not academic explanation.
- Let the world imply history through scars, tools, and consequences.
- Use fragments, testimonies, and inherited warnings over exposition.

### What Must Stay Unknown
- What the veil entities are.
- Whether the Rite is salvation, debt collection, or control.
- Who first authored each Pact.

### What Must Stay Known
- Tribute is required.
- Seals can be broken only by sustained ritual output.
- Resolve is finite.
- Pacts always take more than they promise.

## Player Fantasy
You are a solitary ritual specialist balancing precision against collapse.

- You shape runes into valid offerings.
- You decide how much risk to bind into the ritual.
- You endure escalating chamber hostility long enough to descend.

## Canonical Lexicon (Gameplay Mapping)
Use these terms in player-facing narrative text and visual labels.

- **Blocks** -> **Runes** / **Offerings**
- **Line clears / cluster clears** -> offerings burned into Tribute
- **Score** -> **Tribute**
- **Level** -> **Seal**
- **Timer / turn pressure** -> **Resolve**
- **Shop** -> **Crossroads** / **Grimoire**
- **Vexes** -> **Pacts**

## Core Conflict
The Augur must meet Tribute quotas before Resolve expires. In most descents, this is impossible without Pacts. Each Pact grants throughput and imposes a curse. The deeper the descent, the thinner the distinction between mastery and surrender.

## Gameplay and Visual Anchors (Current Build)
These anchors keep lore grounded without over-explaining:

- Menu framing already supports mystery language: rite, altar, whispers, grimoire.
- Pact flavor text in `src/game/vex.ts` already follows fragmented, escalating occult tone.
- Vex visuals (fog, blackout, tremor, rising pressure effects) should be treated as chamber manifestations, not UI gimmicks.
- Shop and Vex card UI should present tradeoffs as bargains and omens, with numbers as secondary support.

## Alignment Suggestions for Team
Use these to tie gameplay and visual look tighter to the lore style above.

### Copy and UX
- Keep short direct verbs in key buttons, but retain ritual nouns (`Rite`, `Grimoire`, `Pact`, `Seal`).
- Avoid overexplaining in helper copy; imply consequences through warning language.
- In tooltip/body text, lead with fiction first, then provide mechanical detail in a second sentence.

### Systems Presentation
- Treat multipliers as ritual amplification in copy (for example: "tribute deepens") rather than purely numeric gain.
- Frame downside text as cost paid now, not abstract debuff later.
- Preserve rank escalation as psychological/physical manifestation from warning -> presence -> consumption.

### Art and Effects
- Favor layered materials and residue (ash smears, hairline cracks, soot bloom, candle-smoke tones).
- Keep effects imperfect and organic; avoid hard geometric transitions where possible.
- Show ritual wear accumulating around the board frame and altar edges as pressure rises.

## Vex Flavor Text Guidelines
Every Vex in code must implement `getFlavorText(rank: VexRank): string`.

### Style
- Inspiration: Dark Souls, Bloodborne, Hollow Knight.
- Tone: grim, restrained, fatalistic, isolating.
- POV: grimoire fragment, dead witness, ritual notation.

### Language Guardrails
- Prefer: `runes`, `tribute`, `ritual`, `altar`, `void`, `seal`, `resolve`, `pact`.
- Avoid in flavor text: `blocks`, `score`, `game`, `board`, overt system wording.

### Rank Escalation
- **Ranks 1-4 (Warning):** origin hints, inherited cautions, old failures.
- **Ranks 5-9 (Manifestation):** curse gains sensory and physical presence.
- **Rank 10 (Consumption):** concise, final, irreversible voice.

### Example: Rising Dread
- Rank 1: "This altar is built upon the bones of those who failed the Rite. They are restless."
- Rank 5: "They remember the warmth of the living. They are climbing the stones."
- Rank 10: "Make room for them. They have come to take your place."

## Deep Lore Backlog (Optional)
Add only when needed by gameplay features:

- named covens and failed augur lineages,
- regional altar traditions,
- contradictory accounts of the first descent,
- seal-by-seal omen records.

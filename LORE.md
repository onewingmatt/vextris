# Vextris Lore Bible

## One-Page World Frame

Every settlement with standing walls keeps at least one altar below ground.

When you descend, you burn offerings. The chamber accepts them and demands more. Each descent trades flesh, clarity, and agency for passage through seals that no living augur remembers setting. Whether this is salvation, debt collection, or control is not a question asked by those who have taken Pacts.

Resolve is what you have left. Time by those who watch—blood by surgeons, will by priests. The altar does not care which word is used. When it empties, you do not descend further. You simply stop.

Some seals break because you are skilled.

The rest break because you became hungry enough to take what was offered.

## Tone and Narrative Architecture

The Rite of Descent is older than any living covenant and younger than the stone that bears it.

No one agrees on what lies beyond the veil. Some say gods. Some say debris. The practical truth is simpler: when tribute stops, things rise.

- Keep causes **obscure**. Show **effects** with ceremony.
- Speak in ritual certainty, never academic explanation.
- Let the world imply its own history through scars, tools, and what people *don't* say.
- Use fragments, warnings, and inherited marks over exposition.

### Truth Is Layered

**Surface:** What the player observes in the chamber right now—runes burning, seals cracking, pressure mounting.

**Middle:** What faction leaders and bone-scribes believe the Rite demands—toll-keepers' routines, ash collectors' schedules, old Augur marks on the walls.

**Deep:** What might be true but is never confirmed—whether the veil is a barrier or a door, whether failed ascents feed something hungry, whether you are descending or being drawn.

## Player Fantasy

You are a solitary ritual specialist balancing precision against collapse.

- You shape runes into valid offerings.
- You decide which pacts to bind into the ritual, knowing each changes what you are.
- You endure escalating chamber hostility long enough to pass through sealed doors.
- When you fail—and most do—the next augur finds your marks on the walls.

## What Must Stay Unknown

- What the veil entities are, whether they exist, whether the distinction matters.
- Whether the Rite began as salvation, suppression, or something else entirely.
- Who first authored each Pact, or if they chose it, or if choice was ever the right word.
- How many augurs have descended before you.

## What Must Stay Known Through Gameplay

Tribute is required. Resolve is finite. Pacts always take more than they promise. Seals break only through sustained offering. Failure is concrete and irreversible.

## Canonical Language (Internalized, Not Spelled Out)

These correspondences are felt through gameplay, not explained:

- **Blocks → Runes**: in flavor text, describe what the augur is stacking and burning, never the mechanic.
- **Clears → Tribute burned**: show consequence (pressure dropping, seal cracking), not system reward.
- **Score → passage depth**: numbers exist to keep score, not to be the story.
- **Level → Seal number**: reveal through environmental shift and pact unlock, not menu labels.
- **Pressure rising → Resolve depleting**: express as chamber hostility, air thickening, time running out.
- **Shop → the Crossroads / Grimoire opening**: a moment where pacts become audible choices, not transactions.
- **Vexes → Pacts**: each is a bargain made, a scar taken, a piece of the augur left behind in the stone.

**Rule:** Never use system terminology in narrative text shown to the player. The player learns the world through consequence and repetition, not tutorial copy.

## Visual and Gameplay Anchors (Current Build Alignment)

### What the Visuals Already Say

**Title Screen (`Read the Chronicle`, sigil rules, ember halo):**
- The fractured "Vex|tris" split suggests division, incompleteness, ritual inscription.
- Sigil rules frame the title like altar marks—this is authored, heavy, prepared.
- Warm halo suggests both candlelight and something half-seen underneath.
- **Suggestion:** Keep this mystical, minimal. Buttons are ceremonies, not UI.

**Board and Block Rendering:**
- Pixelated runes filled per-tile create a sense of grind and accumulation.
- Color marks each rune type; the board fills like a ritual diagram being drawn.
- **Suggestion:** Continue avoiding artificial "glow" or "level up" feedback. Reward is silent passage, not fanfare.

**Effects (Fog, Blackout, Tremor, Rising Dread):**
- Each Pact's visual side-effect should feel like manifestation, not punishment.
- Fog obscures (clarity cost). Blackout erases (judgment cost). Tremor destabilizes (will cost). Rising Dread pressures from below (time cost).
- **Suggestion:** Visual effects should accumulate; multiple pacts create layered sensory degradation, not a "debuff stack" feeling.

**Game Over / Failure State:**
- The screen should not show "You Lost." Instead: "The Seal Holds." / "Resolve Fades." / Environmental shift (chamber goes quiet, light fades).
- Show the augur's failed descent as a mark added to the altar—a scar, not a score.
- **Suggestion:** Failure should feel less like retry incentive, more like legacy; the next descent inherits the failure.

**Shop / Pact Selection:**
- Treat as The Grimoire opening—quiet, inevitable, offering choices with weight.
- Pact names and flavor come first; the multiplier/cost numbers are the fine print, not the headline.
- **Suggestion:** Present pacts as "this is what you could become" not "here's the math you get."

**Pause Screen (Active Pacts Display):**
- Show the pacts as scar-marks or inscriptions, not a clean list.
- Each visible pact is an acknowledgment of what the augur has *already* bound.
- **Suggestion:** Pausing to see the grimoire should feel like checking old commitments, not reviewing stats.

## Vex Flavor Text Mandate

Every Pact must implement a `getFlavorText(rank: VexRank): string` that positions the curse as something **observed, not explained**.

### Core Principle

The player doesn't read about a debuff. They read a sentence from a dead augur's journal, or a toll-keeper's gossip, or a chamber voice. The mechanical cost is *implicit* in what the flavor text describes.

### Style and Language

**Preferred:** Dark Souls, Bloodborne, Hollow Knight, Inscription.  
**Voice:** Grim, restrained, fatalistic, contaminated with local knowledge.  
**POV:** Grimoire fragment, old toll record, ritual notation, warning carved into stone.

**Use:** runes, tribute, altar, void, seal, resolve, pact, descent, augur, ritual, chamber, veil.  
**Avoid in flavor text:** blocks, score, game, board, level, health, multiplier, debuff, or any system wording.

### Rank Progression (Escalating Manifestation)

**Rank 1 (Whisper):** Pact exists—inheritance, legend, old instruction. Something is offered; the cost is historical, not felt.

**Rank 2 (Presence):** Pact begins to manifest sensory. The augur notices something has changed about the ritual.

**Rank 3 (Visible Mark):** Pact is etched into the augur's body or judgment. Others would recognize this scar.

**Ranks 4–5 (Deep Binding):** The pact shapes how the ritual flows. Cost is no longer theoretical.

**Ranks 6–7 (Consumption):** The pact consumes resources habitually. The augur and the curse blur.

**Ranks 8–9 (Dissolution):** The augur is barely distinguishable from the pact. Language fragments. Warning becomes decree.

**Rank 10 (Finality):** One sentence. Absolute. No return.

### Example Progression: Rising Dread

- **R1:** "The tomb-keepers say this pact was sworn before the first seal was set. They remember warnings. They whisper them still."
- **R2:** "The stone beneath your feet remembers. It breathes when you press down. It is learning you."
- **R3:** "Soil rises around your ankles when the ritual deepens. You are becoming a marker. The next augur will recognize your face."
- **R4–5:** "They have come up through the stone. They are many. They wear what augurs left behind—names, hands, wills."
- **R6–7:** "There is no stone anymore. Only them. Only you. The distinction was never clear."
- **R8–9:** "make room. they are taking."
- **R10:** "You were the door. You are the threshold. You are what they were waiting for."

### Anti-Pattern

**Do not write:**
> "Gain +2x line multiplier but lose 10% of blocks rotated." (This is pure system. Players already know the cost.)

**Instead write in one of these modes:**

1. **Observational:** "Each stone you place feeds something patient. It recalls what augurs taste like." *(Implies the cost: you become less of yourself.)*
2. **Inherited Warning:** "The old bone-scribes note that this pact thins the membrane. Clarity fades first. Other things notice." *(Implies: the challenge shifts, not just the numbers.)*
3. **Environmental:** "The chamber smells iron-rich after you call this. The pressure above does not ease. It waits." *(Implies: you gain throughput but tension remains unresolved.)*

## Gameplay → Lore Tight Coupling

### When the Player Fails (Game Over)

**Current:** The game loops back to the Shop or Retry.  
**Lore Integration:** The failure should feel like it *leaves a mark*. The screen could shift to show the chamber after the augur's descent failed—a scar, a new omen scratched into stone, a silence where pressure was.

**Suggestion for UI:**
- Show "The Seal Holds" (not "Game Over").
- Briefly display environmental consequence: cracks in the seal, a pact's mark burning out on the altar, or silence of failed tribute.
- Button to retry is framed as "Return to the Crossroads" (acknowledging the descent failed, not resetting to a menu).

### When the Player Succeeds (Level Complete)

**Current:** Score/level advancement message.  
**Lore Integration:** The player should feel the seal *give way*. The next seal should arrive as environmental shift first, narrative second.

**Suggestion for UI:**
- Show the seal *cracking* or dissolving, not a "Level Up" banner.
- Brief environmental shift: lights change, pressure briefly releases, the next seal's mark appears below.
- No numbers; consequences only.

### Pause (Active Pacts Display)

**Current:** Clean list of active Vexes in the Grimoire overlay.  
**Lore Integration:** The pacts are scar-marks. Seeing them should feel like checking old commitments etched into flesh or stone.

**Suggestion for UI:**
- Instead of a clean grid, show pacts as **layered inscriptions** or **overlapping runes** on the space.
- Each pact's name and rank are visible, but they *overlap* visually if multiple are active—suggesting they are converging on the augur, not separate modifiers.
- The full flavor text could be revealed on hover/click, encouraging the player to *read and remember* the pacts they've bound.

### The Shop / Pact Offer Screen

**Current:** Buttons with pact rewards/costs side-by-side.  
**Lore Integration:** The shop is the Grimoire opening. The offer is not a transaction; it is a recognition of what the augur has already become.

**Suggestion for UI:**
- Lead with **pact name and flavor text** (not the multiplier).
- Show cost/reward as a **secondary trade line**—rank up multiplier in exchange for manifestation.
- Frame as "accept the pact" not "buy the upgrade"—button could read "Bind the Pact" or "Take the Mark."
- If the augur already has a pact at lower rank, show it as "Deepen the Mark (Rank 3 → 4)" rather than "Upgrade."

## Deep Lore Backlog (Optional Depth)

Add these only when gameplay features demand them:

- **Named covens and failed Augur lineages:** Toll-keepers remember certain descents. Some names are avoided in speech. Some seals bear old marks that match each other.
- **Regional altar traditions:** Different settlements maintain seals in different ways. One keeps a bone-scribe. Another rotates the Augur. A third sealed its altar centuries ago—no new descents.
- **Contradictory seal records:** Grimoires from the same region describe the same seal in incompatible ways. Both are written with certainty. Neither is wrong.
- **Omens tied to specific seal progression:** Seal 3 is where augurs typically break their first major pact. Seal 6 is where the pressure becomes *visible* in the augur's body. Seal 10 is where even survivors differ on what happened.

---

## Quick Integration Checklist

Use this when updating UI, flavor text, or visual effects:

- [ ] Does the text tell you *what happened*, or does it imply *why it matters*?
- [ ] Can you remove the number and have the sentence still make sense? (If not, rewrite without the mechanic visible.)
- [ ] Do visual effects feel like *manifestation* (chamber responding) or *punishment* (UI telling you)?
- [ ] Does failure feel like a *mark left behind* or a *retry prompt*?
- [ ] Do pacts feel like *choices with weight* or *transactions with math*?

If all answers are yes, the lore and gameplay are aligned.

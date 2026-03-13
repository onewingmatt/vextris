# Vextris – Lore & Worldbuilding Guide

## The Core Metaphor: The Rite of Descent
The player is not playing a puzzle game; they are an isolated **Augur** performing a forbidden, occult ritual on a stone altar. 

*   **The Blocks:** Are **Runes** or **Offerings** (carved bone, crystal, and petrified blood). By aligning them into unbroken lines or clustering their sympathetic colors, the Augur burns them away.
*   **Score:** Is **Tribute** sent to the entities waiting beyond the veil.
*   **Level:** Is a **Seal**. You must meet a specific quota of Tribute to break the next Seal.
*   **Timer/Turns:** Is **Resolve**—the Augur's sanity, willpower, or literal blood. Every rune dropped takes a toll.
*   **The Shop:** Is **The Crossroads** or **The Grimoire**.
*   **Vexes:** Are **Pacts** made with malicious spirits, forgotten covens, and dark gods. The Augur *needs* their raw power (score multipliers) to meet the Tribute, but they exact a terrifying physical and psychological toll.

## Vex Flavor Text - AI Generation Guidelines
Every Vex in the codebase must have a `getFlavorText(rank: VexRank) => string` method. 

**Writing Style:**
*   **Inspiration:** Dark Souls, Bloodborne, Hollow Knight.
*   **Tone:** Grim, vague, occult, fatalistic, and isolating.
*   **Perspective:** Written like fragments of lost grimoires, quotes from dead witches, or grim observations of the ritual.
*   **Do Not:** Explain the mechanics in the flavor text. Never use words like "blocks", "score", "game", or "board". Use "runes", "tribute", "ritual", "altar", "void".

**Rank Escalation:**
The flavor text must evolve and become more unhinged as the Vex ranks up.
*   **Ranks 1-4 (The Warning):** Hints at the dark history of the pact or the coven that created it.
*   **Ranks 5-9 (The Manifestation):** The curse is becoming physically real in the room with the Augur.
*   **Rank 10 (The Consumption):** Complete surrender to madness. Direct, chilling, short sentences.

**Example for "Rising Dread" (Garbage rows push up):**
*   *Rank 1:* "This altar is built upon the bones of those who failed the Rite. They are restless."
*   *Rank 5:* "They remember the warmth of the living. They are climbing the stones."
*   *Rank 10:* "Make room for them. They have come to take your place."

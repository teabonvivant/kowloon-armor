# Realism sample implementation plan

> **For agentic workers:** Execute with `superpowers:executing-plans`, task by task in this checkout. User approved the design and execution on 2026-10-15. No additional approval pauses, agents, commits or publication. Checkboxes record verified progress.

**Goal:** Deliver a playable, self-contained Leopard 2 A8 street-intersection firefight for visual acceptance before wider rollout.

**Architecture:** A compile-time sample flag selects a handcrafted 100 m street and Leopard model, the source-backed weapon profile, and the sample preparation screen. Shared input, fixed simulation steps, effects pools, HUD, settings and persistence remain in use. The existing release HTML remains untouched; `npm run build:realism` writes a separately named sample.

**Tech stack:** TypeScript, Three.js 0.180, Web Audio, esbuild, Node test runner and the repository's Playwright Chromium validation infrastructure.

## Constraints

- Prototype first: one Leopard 2 A8 and one complete encounter. No claims of AAA quality or real-device performance.
- Preserve mobile central visibility, keyboard/mouse, HOTAS, comfort controls and offline operation.
- Same muzzle transform drives physical launch, visible barrel, flash and shot sound. Non-uniform root scale cannot skew direction.
- Swept ground, walls and tank hits compete for the earliest contact. No persistent smoke projectile trail.
- Recoiling tube is a child of the stationary cradle; the firing event preserves driving suspension and drives camera timing.
- Use verified Rheinmetall DM63A1/L55 1720 m/s reference only for the sample Leopard. Gravity 9.81 m/s²; drag, penetration, reload and damage remain simplified/game-balanced.
- Original procedural audio; no commercial assets or claimed live recordings.
- Before/after same-camera screenshots plus normal-speed recorded/rendered gameplay and playable WAV. Frame-rendered video is explicitly identified, never represented as real-time performance.

## 1. Baseline and testable shooting contract

Files: `scripts/realism-check.mjs`, `docs/evidence/realism/`, `src/ballistics.ts`, `src/realism.ts`.

- [x] Read approved design and current engine. Confirm existing checkout is the expressly assigned workspace.
- [x] Verify official Rheinmetall PDF page 6: DM63A1 L55 1720 m/s, L44 1650 m/s. Do not infer every tank's ammunition from bore diameter.
- [x] Record baseline test results and preserve baseline HTML/screenshots/audio before changing runtime code.
- [x] Write failing tests for `weaponProfile(spec)`, `launchPose(actor)`, continuous nearest contact, side/front/elevated recoil and a moving-target intercept. Run `node scripts/realism-check.mjs`; failures must identify the original defects or missing contract.
- [x] Implement `WeaponProfile { id, velocity, gravity, provenance }`, `launchPose(actor): { origin, direction, breech }`, `intercept(actor, target): { aim, pitch, seconds }`. Sample-only physical profile is returned when the build flag is true; regular build keeps its existing balance.
- [x] Run the focused checks and `npm run check`.

## 2. Integrate ballistics, recoil and encounter

Files: `src/combat.ts`, `src/actors.ts`, `src/field.ts`, `src/operations.ts`, `src/game.ts`, `src/render/tank.ts`, `src/armor.ts`, `src/view.ts`.

- [x] Fire from the exact world muzzle at the shot event. Sweep breech-to-muzzle clearance, then the gravity-adjusted travel segment; choose the minimum of ground/wall/vehicle contacts. Keep shell source and force direction immutable after firing.
- [x] Put recoil travel on `recoilTube.position.z`, leaving the elevated cradle fixed. At age zero preserve suspension; first forward recoil pitch must raise the nose, side recoil must roll away from the gun. Camera uses `visual.shotAge`.
- [x] Use the same profile and muzzle for HUD range/drop/lead, aim projection and AI intercept. Aim at a hittable centre, compensate travel time, include target velocity.
- [x] Build a deterministic two-opponent sample encounter through the real Game loop; validate victory and unattended defeat with input-only scripts. Keep full-release campaign behavior unchanged until rollout.
- [x] Run `node scripts/realism-check.mjs`, existing regression suite and TypeScript.

## 3. Model, materials and street composition

Files: `src/render/leopard.ts`, `src/render/realism-materials.ts`, `src/render/realism-world.ts`, `src/render/tank.ts`, `src/view.ts`.

- [x] Create an original approximate-profile Leopard hull, pronounced wedge turret, stationary mantlet, long thermal-sleeved barrel, wheels/track return and separated rubber/paint/steel roughness. Use shared geometries/materials to keep restarts bounded; this is not a measured engineering replica.
- [x] Compose the spawn street with irregular building heights and setback, corner tea café and pharmacy, verandas, recessed varied windows, worn awnings, service cables, asymmetric midground and distant atmospheric termination.
- [x] Concentrate patched asphalt, road repairs, gutter deposits, wall scarring and rubble around the encounter. Keep drivable lanes and the same sample collision geometry aligned.
- [x] Use directional warm daylight, restrained cool fill, localized contact shadows and an offline procedural environment. Inspect medium-quality same-camera and HUD/FX-hidden frames before adjusting.

## 4. Preparation identity, audio and offline packaging

Files: `src/realism-ui.ts`, `src/realism.css`, `src/garage.ts`, `src/interface.ts`, `src/effect-audio.ts`, `src/audio.ts`, `scripts/build.mjs`, `package.json`.

- [x] Create consistent Chinese wordmark, unit insignia and operation 01 preparation layout; show sample scope, fixed vehicle, street objective, live controls and deployment action without catalogue noise.
- [x] Keep existing settings/HOTAS, multi-touch and pauses. Make 390×844, 844×390, 1280×577 and 1440×900 layouts usable; central sightline remains clear. Also verify 820×1180 tablet.
- [x] Add original cannon transient, pressure body, breech mechanism and spaced alley reflections under the same event clock. Apply interior/exterior filtering and existing distance/occlusion; respect volume/pause/low-dynamic-range controls.
- [x] Add `build:realism`; create `九龍裝甲行動-寫實樣板.html` without replacing `九龍裝甲行動.html`.

## 5. Playable evidence and handoff

Files: `scripts/realism-browser.mjs`, `scripts/realism-evidence.mjs`, `docs/realism-rebuild-validation.md`, `docs/evidence/realism/`.

- [x] Offline artifact smoke: actual start, movement, stop, turret, firing, reload, pause, settings and touch. Source harness validates hits, complete encounter, repeated restarts and simulated HOTAS. No test interfaces in the distributed sample; full victory is not claimed as a hardware-input artifact-only test.
- [x] Record same-camera before/after garage and drive shots, clean HUD-hidden material frames. Front/side/elevated mechanism and actual bore-axis diagnostics are automated numerical tests, not a separately filmed high-speed engineering inspection.
- [x] Record timing-correct normal-speed complete sequence and before/after sound. Save methodology, event timeline and frame timings so video is not confused with benchmark evidence. Final MP4 is 43.75 seconds, 525 frames at 12 fps, with exact-timeline stereo audio.
- [x] Record median/P95 rendered frame time, draw calls, triangles, renderer identity and restart resource counts at the same resolution/quality. Explicitly report the approximately 53% slower sample median; performance acceptance is not achieved.
- [x] Self-review code and evidence. Update this plan and validation report with exact results and limits. Hand artifacts to primary agent for independent visual review; user acceptance precedes main-game rollout.

## Progress log

- 2026-10-15: Design approval conveyed by primary. Baseline suite running. Official weapon PDF verified. Browser-act has no configured browser; local application verification uses the existing repository Playwright stack (no remote sessions or accounts).
- 2026-10-15: Preserved baseline HTML, medium same-camera screenshots and 120 mm WAV; initial focused red tests recorded in `.omo/realism-red.log`. Independent bore-axis regression exposed non-uniform scaling skew and drove a world-frame cradle correction.
- 2026-10-15: First source renders reviewed by primary; moved obstructing hero lamp, reduced road texture repetition, added meaningful turret fixtures, asymmetric cafe/pharmacy massing and credible end facade. Art remains visibly procedural; no AAA claim or wider rollout.
- 2026-10-15: Independent reviewer reproduced near enemy before muzzle and body-frame/rotating-origin intercept failures. Added red regressions and fixed swept initial contact plus iterative local gun-frame solver. Focused suite now 13/13; reviewer and primary independently repeated the probes successfully.
- 2026-10-15: Isolated all sample progress writes, including training/import/reset. Main `npm test` and TypeScript pass. Final artifact five-size operation run passed; source encounter won in 42.18 seconds, 8 shots/6 hits/2 kills, six restarts bounded, simulated HOTAS passed.
- 2026-10-15: Independent audio review found full-mix transient peak 1.0292; sample-only output headroom corrected it to .82336. All 18 scenarios/70 audio checks now pass, with playable WAVs; no human listening claim.
- 2026-10-15: High-resolution artifact screenshots are complete. Video capture changed from costly 24 fps to clearly labelled timing-correct 12 fps/768×432 full rendering, sequential with browser/benchmark to avoid GPU contention. Partial first attempt retained under `.omo/realism-gameplay-partial-24fps.mp4` and not used as final evidence.
- 2026-10-15: Completed 525-frame/43.75-second sequence and synchronized audio/video. All 36 cannon/contact events were accepted, maximum 18 voices, final zero; WAV/AAC are finite and unclipped. Inspected extracted fire, fight and victory frames. This source recording predates only the final map-label correction, which is not shown in the video.
- 2026-10-15: Final sample map removes absent city landmarks/shortcuts and labels its actual obstacle/actor map. Added failing markup regression then fixed it: 14/14 focused tests. Final standalone rebuilt and five-size browser run repeated, hash `7ba496cdf6a01259615649a9ca410be3c75be0a4b73514be1f01da59e6be5e18`; operations 10/10 and touch 7/7 remain passing.
- 2026-10-15: Complete render + blocking pixel-readback comparison at medium/1280×800: baseline median/P95 1148.0/1402.9 ms, sample 1753.2/2169.9 ms. Sample has fewer calls/triangles but is slower here; material/shader cost needs profiling before rollout. Final gallery links checked; report, playable HTML, source evidence, WAV and MP4 handed to primary. No commits or publication.

## Outside this sample handoff

- [ ] User visual/listening acceptance of the proposed direction.
- [ ] Address measured rendering regression and verify physical devices, Safari, Windows GPU and HOTAS.
- [ ] Only after acceptance, plan other vehicles/streets and six-mission balance. No claim that the wider rebuild is complete.

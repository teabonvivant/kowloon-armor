# Kowloon Armor design system

## 1. Direction
Cinematic playable vehicle showroom and combat game. Reference shortlist: Tesla, Linear, Nike. Selected Tesla vehicle-first full viewport and cinematic visual style, adapted to tactical game UI. World of Tanks official Garage 2.0 informs model carousel and characteristics hierarchy. Original interface and models, no borrowed logos.
## 2. Colour
Canvas #111719; deep #090d0f; panel #161e21; raised #202b2e; line #394447. Text #f2f2e9, secondary #bec9c5, muted #a1afab. Amber ramp #6f4b25 / #b5793f / #e8a65a / #ffd18b. Enemy #f36a5b; ally #84c7b0. World sky #899a9e, sun #ffe1b8, concrete #88918b. Procedural world material colors vary for texture/neon.
## 3. Typography
Bahnschrift / Arial Narrow display and numeric; Microsoft JhengHei / PingFang TC UI and Chinese. Offline system fonts. Display64/52/40, headings28/22, body16/14, labels12, technical metadata11. Tabular telemetry.
## 4. Layout
4px spacing grid:4,8,12,16,20,24,32,40,48,64. Header64; bounded left operation and right vehicle rails; independent deployment88 and carousel164 rows, compressed below760/590px viewport height. Central tank is framed within the measured showroom slot. Below1100 reduce rails; below768 stack menu and permit scrolling. Portrait HUD remains compact; modal max980 within92dvh.
## 5. Primitives
Button: min44px,2px radius; amber primary dark text; secondary dark outline. Hover brightness, pressed translateY1, focus2px amber, disabled .45 with explanation. ModeOption: icon/two lines, selected amber edge, aria-pressed. TankCard: country code/model silhouette/name/role, amber selected rule, keyboard operable, search empty state. StatRow: label/value/scaled meter using game-balanced numbers. Native Dialog: labelled, Escape, autofocus, focus restoration, close, scroll. Field: visible label/dark input/focus/error. MissionTile: numbered location, completed or locked. HUD: actual telemetry on translucent charcoal. Settings: settings-grid/settings-field/device-card, live readout meters and same buttons.
## 6. Motion
180ms transform/opacity interaction; camera interpolation. Reduced motion removes nonessential showroom motion. Pause on focus loss and active device disconnect. Inputs keep gameplay keys outside forms.
## 7. Depth and acceptance
Real geometry and procedural textures, warm sun/cool fill, fog/shadows, bilingual projecting street signs. UI charcoal translucency plus top edge and technical rules. Four tank silhouettes with model/color/stat variation. Scene is a fictional Kowloon training circuit, not surveyed mapping. Gameplay physics and armour are balanced accessible simulation; no AAA-fidelity claim, no online multiplayer claim.

## 8. Field expansion (1.1)
Garage modes use a compact 2×2 selector, with a persistent difficulty field, a mission-specific deployment button, and a local best-score readout. At short desktop heights, subtitles collapse before controls collide with the fleet; at portrait widths, the garage scrolls. The selected vehicle always remains present in the carousel.

HUD priorities are objective / live wave status, actual cardinal direction, target alignment, reload ring, hit confirmation, then driving and map telemetry. Enemy labels respect building occlusion; the minimap remains the overview. Results explain accuracy and difficulty multiplier. Preferences persist, dialogs release pointer lock, and reduced-motion mode also respects the operating system preference.

Vehicle details use a shared original camouflage DataTexture, stencilled fleet numbers, road wear, stowage and a moving gun recoil assembly. Four existing model families and all 30 choices remain. Street shelters, cabinets, drain covers and asphalt repairs use batched original geometry. Window frames use a shared procedural texture; only structural building masses cast building shadows. Detailed geometry is spatially partitioned where its vertex cost warrants the extra draws. Medium shadows use 1024² and high shadows use 2048².

## 9. Tactical clarity (1.2)
Objective location, uncontested seconds and defence integrity sit together in the existing left panel, with a matching ground ring and minimap boundary. Hull/turret bearings remain separate; holding observation changes only the camera. Incoming fire has a directional shape as well as text. Track damage names its side and stationary repair countdown; hit confirmation names armour face and component. The minimap has a measured 100 m line.

Between survival waves, one compact two-choice panel explains 35% hull/track repair versus exactly four reloads at 68% duration. It defaults to repair and displays the countdown; selection is keyboard accessible. Native settings add scope behaviour/magnification, bounded HUD scale and a dedicated key-binding dialog. Duplicate keys swap, Escape stays reserved, and defaults can be restored. Portrait settings scroll without hiding the close control; this is not a touch-driving interface.

Four representative models add original identifying fittings within existing batches. One instanced tread mesh per vehicle animates left/right phases independently. Five district labels and batched harbour/market/clock silhouettes distinguish the street grid. Dust uses a reusable 96-point buffer, bursts are capped at 20, and audio reuses one noise buffer with at most 16 voices. Cannon sound has listener-relative pan, distance attenuation and low-pass filtering; reload-ready and component-hit cues remain short. These are deliberate procedural approximations, not licensed assets or precision vehicle replicas.

## 10. Deployment readiness (1.3)

The garage uses a single structural grid rather than overlapping absolute-positioned controls: operation / live vehicle / specification, then deployment, then the stable 30-vehicle fleet. The deployment line unifies current operation, difficulty, local record and one primary action. Darkened side scrims keep the original city and tank visible without asking players to read over shop signs. At short heights only secondary rail content scrolls; on mobile the page scrolls naturally and the model is reframed, not replaced by a decorative card.

Briefings use a compact native SVG of the actual road grid, starting positions and objective area, paired with mission rules and a direct deployment action. The catalogue adds weight-based filters, stat sorting and a recoverable empty state; the underlying fleet order remains unchanged.

Settings use four semantic tabs with roving focus, arrow/Home/End navigation, native labelled controls and a sticky modal header. Progress backup states explicitly distinguish validating, preview, cancelled, merged, invalid and storage failure. Imported text never becomes raw markup. Async reads are revision-guarded and cancelled with the modal; backups max-merge only after explicit confirmation and successful persistence.

Optional training adds one compact four-step HUD panel driven by real game state; completed training has a clear return-to-campaign action. Exit confirmation prevents accidental abandonment. Debriefs report actual outcome, the previous local best, result-specific advice and persistence status. Critical mission time and hull integrity include textual warnings, not colour alone. All additions retain offline fonts/assets, visible keyboard focus and reduced-motion support.

# Kowloon Armor design system

## 1. Direction
Cinematic playable vehicle showroom and combat game. Reference shortlist: Tesla, Linear, Nike. Selected Tesla vehicle-first full viewport and cinematic visual style, adapted to tactical game UI. World of Tanks official Garage 2.0 informs model carousel and characteristics hierarchy. Original interface and models, no borrowed logos.
## 2. Colour
Canvas #111719; deep #090d0f; panel #161e21; raised #202b2e; line #394447. Text #f2f2e9, secondary #b6c0bd, muted #8a9996. Amber ramp #6f4b25 / #b5793f / #e8a65a / #ffd18b. Enemy #f36a5b; ally #84c7b0. World sky #899a9e, sun #ffe1b8, concrete #88918b. Procedural world material colors vary for texture/neon.
## 3. Typography
Bahnschrift / Arial Narrow display and numeric; Microsoft JhengHei / PingFang TC UI and Chinese. Offline system fonts. Display64/52/40, headings28/22, body16/14, labels12, technical metadata11. Tabular telemetry.
## 4. Layout
4px spacing grid:4,8,12,16,20,24,32,40,48,64. Header76; left mode rail300; right stat panel250; bottom carousel152. Central tank remains visible. Below1100 reduce rails; below768 stack menu and permit scrolling. Portrait HUD remains compact; modal max900 within88dvh.
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

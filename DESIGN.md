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

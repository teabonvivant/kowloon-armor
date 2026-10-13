
> kowloon-armor@1.6.0 test /home/workspace/kowloon-armor-review
> node scripts/simulation-check.mjs && node scripts/upgrade-check.mjs && node scripts/tactical-check.mjs && node scripts/campaign-check.mjs && node scripts/deployment-check.mjs && node scripts/hong-kong-check.mjs && node scripts/field-check.mjs && node scripts/operations-check.mjs

{
  "passed": 9,
  "failed": 0,
  "sourceStable": true,
  "firstMission": {
    "phase": "victory",
    "kills": 2,
    "hits": 6,
    "shots": 6,
    "elapsed": 27.833333,
    "hp": 929,
    "shotTimes": [
      0.016667,
      5.533333,
      11.05,
      16.566667,
      22.083333,
      27.6
    ],
    "finishes": [
      true
    ],
    "missionId": 1,
    "enemyHealth": [
      0,
      0
    ]
  },
  "evidence": ".omo/evidence/simulation-results.json"
}
TAP version 13
# Subtest: seeded opponents stay on roads, away from the player and one another
ok 1 - seeded opponents stay on roads, away from the player and one another
  ---
  duration_ms: 15.693904
  type: 'test'
  ...
# Subtest: difficulty changes opponents while keeping the selected tank intact
ok 2 - difficulty changes opponents while keeping the selected tank intact
  ---
  duration_ms: 26.524101
  type: 'test'
  ...
# Subtest: survival grants one repair between waves, pauses countdown, and caps live opponents
ok 3 - survival grants one repair between waves, pauses countdown, and caps live opponents
  ---
  duration_ms: 23.096762
  type: 'test'
  ...
# Subtest: records keep campaigns compatible and separate difficulty scores
ok 4 - records keep campaigns compatible and separate difficulty scores
  ---
  duration_ms: 0.353348
  type: 'test'
  ...
# Subtest: preferences validate persisted data and tolerate blocked storage
ok 5 - preferences validate persisted data and tolerate blocked storage
  ---
  duration_ms: 3.946239
  type: 'test'
  ...
# Subtest: spatial batches preserve every transform and colour with local bounds
ok 6 - spatial batches preserve every transform and colour with local bounds
  ---
  duration_ms: 0.335373
  type: 'test'
  ...
# Subtest: each tank renders fourteen wheels in one animated batch and releases instance buffers
ok 7 - each tank renders fourteen wheels in one animated batch and releases instance buffers
  ---
  duration_ms: 0.999482
  type: 'test'
  ...
# Subtest: nearby opponents keep moving when a building blocks their line of fire
ok 8 - nearby opponents keep moving when a building blocks their line of fire
  ---
  duration_ms: 2.372882
  type: 'test'
  ...
# Subtest: all campaigns and seeded encounters spawn clear of the full city obstacles
ok 9 - all campaigns and seeded encounters spawn clear of the full city obstacles
  ---
  duration_ms: 157.034703
  type: 'test'
  ...
# Subtest: real incoming fire ends an unattended campaign and retry restores clean state
ok 10 - real incoming fire ends an unattended campaign and retry restores clean state
  ---
  duration_ms: 105.434863
  type: 'test'
  ...
1..10
# tests 10
# suites 0
# pass 10
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 345.95212
TAP version 13
# Subtest: an in-flight shell keeps identical damage when its shooter turns away
ok 1 - an in-flight shell keeps identical damage when its shooter turns away
  ---
  duration_ms: 28.671151
  type: 'test'
  ...
# Subtest: 30, 60 and 144 Hz render schedules consume every mouse pixel exactly once
ok 2 - 30, 60 and 144 Hz render schedules consume every mouse pixel exactly once
  ---
  duration_ms: 20.861157
  type: 'test'
  ...
# Subtest: large pointer displacement is not clipped to a keyboard axis
ok 3 - large pointer displacement is not clipped to a keyboard axis
  ---
  duration_ms: 0.24435
  type: 'test'
  ...
# Subtest: continuous component hits distinguish turret, hull and both tracks, including rotated tanks
ok 4 - continuous component hits distinguish turret, hull and both tracks, including rotated tanks
  ---
  duration_ms: 3.442358
  type: 'test'
  ...
# Subtest: track damage limits mobility and only stationary time repairs it
ok 5 - track damage limits mobility and only stationary time repairs it
  ---
  duration_ms: 27.432025
  type: 'test'
  ...
# Subtest: lighter vehicles accelerate and pivot faster without changing catalogue statistics
ok 6 - lighter vehicles accelerate and pivot faster without changing catalogue statistics
  ---
  duration_ms: 9.595886
  type: 'test'
  ...
# Subtest: capture requires uncontested presence and kills alone cannot complete it
ok 7 - capture requires uncontested presence and kills alone cannot complete it
  ---
  duration_ms: 11.55442
  type: 'test'
  ...
# Subtest: contested capture freezes progress; defence falls to an occupied zone
ok 8 - contested capture freezes progress; defence falls to an occupied zone
  ---
  duration_ms: 2.267874
  type: 'test'
  ...
# Subtest: defence requires its full hold duration and retry resets a breached objective
ok 9 - defence requires its full hold duration and retry resets a breached objective
  ---
  duration_ms: 30.509782
  type: 'test'
  ...
# Subtest: survival repair restores hull and both tracks exactly once
ok 10 - survival repair restores hull and both tracks exactly once
  ---
  duration_ms: 11.80729
  type: 'test'
  ...
# Subtest: survival ammunition accelerates exactly four reloads without repairing hull
ok 11 - survival ammunition accelerates exactly four reloads without repairing hull
  ---
  duration_ms: 13.818797
  type: 'test'
  ...
# Subtest: tactics assign opposite flanks, use cover while reloading and withdraw at low health
ok 12 - tactics assign opposite flanks, use cover while reloading and withdraw at low health
  ---
  duration_ms: 2.298455
  type: 'test'
  ...
# Subtest: enemy orders retain flank and retreat routes around objectives; difficulty changes response
ok 13 - enemy orders retain flank and retreat routes around objectives; difficulty changes response
  ---
  duration_ms: 3.227534
  type: 'test'
  ...
# Subtest: road navigation chooses a connected turn around a building
ok 14 - road navigation chooses a connected turn around a building
  ---
  duration_ms: 1.842727
  type: 'test'
  ...
# Subtest: road navigation reserves vehicle clearance around a visible building corner
ok 15 - road navigation reserves vehicle clearance around a visible building corner
  ---
  duration_ms: 1.453619
  type: 'test'
  ...
# Subtest: enemy continues through a road junction instead of stopping outside the routing threshold
ok 16 - enemy continues through a road junction instead of stopping outside the routing threshold
  ---
  duration_ms: 1.186078
  type: 'test'
  ...
# Subtest: key rebinding swaps conflicts, rejects reserved keys and round-trips with old settings
ok 17 - key rebinding swaps conflicts, rejects reserved keys and round-trips with old settings
  ---
  duration_ms: 4.787669
  type: 'test'
  ...
# Subtest: independent observation leaves the gun bearing unchanged and release returns to the gun
ok 18 - independent observation leaves the gun bearing unchanged and release returns to the gun
  ---
  duration_ms: 2.640921
  type: 'test'
  ...
# Subtest: pivoting animates opposite track directions without adding a draw for each link
ok 19 - pivoting animates opposite track directions without adding a draw for each link
  ---
  duration_ms: 0.970341
  type: 'test'
  ...
# Subtest: bursts and track dust remain bounded and clear releases transient resources
ok 20 - bursts and track dust remain bounded and clear releases transient resources
  ---
  duration_ms: 2.993129
  type: 'test'
  ...
# Subtest: spatial sound uses listener orientation and distance, including coincident sounds
ok 21 - spatial sound uses listener orientation and distance, including coincident sounds
  ---
  duration_ms: 0.203685
  type: 'test'
  ...
1..21
# tests 21
# suites 0
# pass 21
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 196.84765
{"mission":1,"vehicle":"leopard2a8","kind":"clear","phase":"victory","elapsed":16.850000000000325,"hp":1002,"kills":2,"shots":4,"hits":4,"objective":{"progress":0,"integrity":100,"contested":false,"inside":false},"position":[-1.1642593365624369e-15,0,65.46746828896553],"enemies":[]}
{"mission":2,"vehicle":"leopard2a8","kind":"capture","phase":"victory","elapsed":79.86666666666342,"hp":936,"kills":3,"shots":9,"hits":6,"objective":{"progress":20,"integrity":100,"contested":false,"inside":true},"position":[18.16546924961408,0,2.525886613053101],"enemies":[]}
{"mission":3,"vehicle":"leopard2a8","kind":"clear","phase":"victory","elapsed":65.5833333333309,"hp":656,"kills":4,"shots":11,"hits":11,"objective":{"progress":0,"integrity":100,"contested":false,"inside":false},"position":[0.1773485726583003,0,58.39359506541064],"enemies":[]}
{"mission":4,"vehicle":"leopard2a8","kind":"defend","phase":"victory","elapsed":45.016666666665394,"hp":752,"kills":4,"shots":9,"hits":8,"objective":{"progress":45,"integrity":100,"contested":false,"inside":true},"position":[84,0,100],"enemies":[{"position":[63.258521786312905,0,2.199451241948484],"hp":353,"tactic":"advance"}]}
{"mission":5,"vehicle":"leopard2a8","kind":"capture","phase":"victory","elapsed":124.14999999999424,"hp":567,"kills":6,"shots":16,"hits":14,"objective":{"progress":30,"integrity":100,"contested":false,"inside":true},"position":[-81.49337130324763,0,-65.91410761746334],"enemies":[]}
{"mission":6,"vehicle":"leopard2a8","kind":"defend","phase":"victory","elapsed":68.41666666666407,"hp":160,"kills":4,"shots":12,"hits":11,"objective":{"progress":60,"integrity":32.79999999999833,"contested":false,"inside":true},"position":[5.734315752776847,0,12.369390857480742],"enemies":[{"position":[-81.27292023841422,0,8.202816986267635],"hp":401,"tactic":"flank"},{"position":[68.89607217251499,0,1.8585635750576492],"hp":126,"tactic":"cover"},{"position":[-64.23090923605973,0,9.125360801861676],"hp":345,"tactic":"cover"},{"position":[-54.77714444778373,0,8.879609274641028],"hp":206,"tactic":"advance"}]}
TAP version 13
# Subtest: versioned backup round-trips legacy records and merges idempotently without losing better local scores
ok 1 - versioned backup round-trips legacy records and merges idempotently without losing better local scores
  ---
  duration_ms: 4.09293
  type: 'test'
  ...
# Subtest: invalid backups cannot be used as progress: oversized, unrelated, newer, negative, non-finite and hostile keys
ok 2 - invalid backups cannot be used as progress: oversized, unrelated, newer, negative, non-finite and hostile keys
  ---
  duration_ms: 1.998018
  type: 'test'
  ...
# Subtest: a damaged current record recovers the last valid copy and exposes storage failures
ok 3 - a damaged current record recovers the last valid copy and exposes storage failures
  ---
  duration_ms: 0.990626
  type: 'test'
  ...
# Subtest: save merges newer records from another tab and never writes malformed values
ok 4 - save merges newer records from another tab and never writes malformed values
  ---
  duration_ms: 0.551011
  type: 'test'
  ...
# Subtest: deployment choice validates per field and legacy preferences retain defaults
ok 5 - deployment choice validates per field and legacy preferences retain defaults
  ---
  duration_ms: 1.771823
  type: 'test'
  ...
# Subtest: optional training requires real driving, a stop, independent aim and a new shot; pause and restart are safe
ok 6 - optional training requires real driving, a stop, independent aim and a new shot; pause and restart are safe
  ---
  duration_ms: 60.108889
  type: 'test'
  ...
# Subtest: mobile garage framing stays in document space after selecting a tank below the fold
ok 7 - mobile garage framing stays in document space after selecting a tank below the fold
  ---
  duration_ms: 0.487562
  type: 'test'
  ...
1..7
# tests 7
# suites 0
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 78.188129
TAP version 13
# Subtest: six distinctive districts replace buildings without blocking the road network
ok 1 - six distinctive districts replace buildings without blocking the road network
  ---
  duration_ms: 189.539805
  type: 'test'
  ...
# Subtest: every hostile tank gets role fittings without modifying its friendly counterpart
ok 2 - every hostile tank gets role fittings without modifying its friendly counterpart
  ---
  duration_ms: 48.502253
  type: 'test'
  ...
# Subtest: music has an independent persistent volume and migrates old settings
ok 3 - music has an independent persistent volume and migrates old settings
  ---
  duration_ms: 3.683125
  type: 'test'
  ...
# Subtest: market alleys can be driven end to end while stalls still block shells
ok 4 - market alleys can be driven end to end while stalls still block shells
  ---
  duration_ms: 116.560086
  type: 'test'
  ...
# Subtest: damage shading is idempotent and repairs restore original instance colours
ok 5 - damage shading is idempotent and repairs restore original instance colours
  ---
  duration_ms: 1.151748
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 374.913798
TAP version 13
# Subtest: fire solution picks nearest hull along the barrel, respects pitch and walls
ok 1 - fire solution picks nearest hull along the barrel, respects pitch and walls
  ---
  duration_ms: 27.687523
  type: 'test'
  ...
# Subtest: threat alert requires line of sight, aim and imminent reload
ok 2 - threat alert requires line of sight, aim and imminent reload
  ---
  duration_ms: 5.41793
  type: 'test'
  ...
# Subtest: tour is optional, requires stopping and resets on a new sortie
ok 3 - tour is optional, requires stopping and resets on a new sortie
  ---
  duration_ms: 13.966682
  type: 'test'
  ...
# Subtest: debrief counts actual damage and movement, resets between rounds
ok 4 - debrief counts actual damage and movement, resets between rounds
  ---
  duration_ms: 15.913171
  type: 'test'
  ...
# Subtest: new presentation options migrate and persist without replacing old controls
ok 5 - new presentation options migrate and persist without replacing old controls
  ---
  duration_ms: 3.453135
  type: 'test'
  ...
# Subtest: adaptive resolution ignores isolated spikes and recovers more slowly than it falls
ok 6 - adaptive resolution ignores isolated spikes and recovers more slowly than it falls
  ---
  duration_ms: 0.514964
  type: 'test'
  ...
# Subtest: all six tour stops are on clear roads and a movement-input pilot can visit every stop
ok 7 - all six tour stops are on clear roads and a movement-input pilot can visit every stop
  ---
  duration_ms: 1770.180438
  type: 'test'
  ...
# Subtest: navigation describes relative left and right without rotating the tank
ok 8 - navigation describes relative left and right without rotating the tank
  ---
  duration_ms: 1.346721
  type: 'test'
  ...
# Subtest: track repair status pauses with throttle and resumes when stationary
ok 9 - track repair status pauses with throttle and resumes when stationary
  ---
  duration_ms: 2.086562
  type: 'test'
  ...
# Subtest: received damage equals actual health loss from enemy fire
ok 10 - received damage equals actual health loss from enemy fire
  ---
  duration_ms: 7.040797
  type: 'test'
  ...
1..10
# tests 10
# suites 0
# pass 10
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1858.853737
TAP version 13
# Subtest: waypoint rejects obstacles and clears on arrival, not while paused
ok 1 - waypoint rejects obstacles and clears on arrival, not while paused
  ---
  duration_ms: 33.289239
  type: 'test'
  ...
# Subtest: new sortie resets log, waypoint and challenge without altering seeded spawns
ok 2 - new sortie resets log, waypoint and challenge without altering seeded spawns
  ---
  duration_ms: 62.820492
  type: 'test'
  ...
# Subtest: comfort settings migrate independently and malformed values do not erase controls
ok 3 - comfort settings migrate independently and malformed values do not erase controls
  ---
  duration_ms: 3.918144
  type: 'test'
  ...
# Subtest: seed parser rejects coercion, overflow and decimals
ok 4 - seed parser rejects coercion, overflow and decimals
  ---
  duration_ms: 0.298273
  type: 'test'
  ...
# Subtest: ballistic estimate uses game velocity and signed lateral motion
ok 5 - ballistic estimate uses game velocity and signed lateral motion
  ---
  duration_ms: 5.717565
  type: 'test'
  ...
# Subtest: contracts require meaningful combat and do not grant armor awards on defeat
ok 6 - contracts require meaningful combat and do not grant armor awards on defeat
  ---
  duration_ms: 4.287622
  type: 'test'
  ...
# Subtest: frame statistics are bounded and pause samples are excluded
ok 7 - frame statistics are bounded and pause samples are excluded
  ---
  duration_ms: 0.388343
  type: 'test'
  ...
# Subtest: report is a snapshot with explicit version and actionable coaching
ok 8 - report is a snapshot with explicit version and actionable coaching
  ---
  duration_ms: 7.300887
  type: 'test'
  ...
# Subtest: battle journal retains only the most recent forty timestamped events
ok 9 - battle journal retains only the most recent forty timestamped events
  ---
  duration_ms: 8.259288
  type: 'test'
  ...
# Subtest: scope sensitivity changes only scoped mouse displacement, not ordinary or observation input
ok 10 - scope sensitivity changes only scoped mouse displacement, not ordinary or observation input
  ---
  duration_ms: 1.885497
  type: 'test'
  ...
1..10
# tests 10
# suites 0
# pass 10
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 141.844024

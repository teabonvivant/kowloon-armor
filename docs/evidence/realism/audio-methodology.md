# Realism sample audio evidence

Numerical signal and lifecycle evidence only. No human listening, loudness preference, physical speakers/headphones, hardware latency or real-time performance acceptance.

Passed: true. Failed checks: none.

```json
{
  "renderer": "Chromium OfflineAudioContext; sample production GameAudio with __REALISM_SAMPLE__=true",
  "sampleRate": 48000,
  "channels": 2,
  "encoding": "16-bit PCM WAV; floating-point measurements are taken before quantization",
  "scheduling": "Render suspends at the 128-frame quantum immediately before each event. Sources are created only at that event, with exact event time exposed as currentTime. Rendering resumes between events, allowing onended to reclaim voices. No whole-timeline upfront source scheduling.",
  "clockAdapter": "Offline context state is exposed as running while invoking gameplay APIs, as in the real application. All native audio methods remain bound to the actual OfflineAudioContext.",
  "controls": "Comparison: 120 mm, master volume 0.7, effects 1, engine/alerts/music 0; shot at 0.5 seconds, stop at 3 seconds; no normalization or post-processing.",
  "randomness": "Current sample renders seed Math.random=123 for shared procedural buffers; cannon-specific noise uses the production fixed seed. Preserved baseline uses its original capture randomness.",
  "limitations": "Numerical signal and lifecycle evidence only. No human listening, loudness preference, physical speakers/headphones, hardware latency or real-time performance acceptance.",
  "comparison": {
    "file": "audio-before-after.wav",
    "baselineFile": "before-cannon.wav",
    "baselineSha256": "8e28200b3bbc983a510f32fa7f8a855c702197ec968fb0fcf3788531c042dab4",
    "baselineSeconds": 5,
    "baselinePcmPeak": 0.30010986328125,
    "baselinePcmRms": 0.019266237133941037,
    "silenceSeconds": 1,
    "afterStartsAt": 6,
    "labels": "Preserved v1.8 baseline first, then sample exterior. Equal settings; no loudness matching."
  }
}
```

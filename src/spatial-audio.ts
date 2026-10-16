interface Position { readonly x: number; readonly z: number }
export function spatialMix(listener: Position, yaw: number, source: Position): { pan: number; gain: number; cutoff: number } {
  const offsetX = source.x - listener.x, offsetZ = source.z - listener.z;
  const distance = Math.hypot(offsetX, offsetZ);
  return { pan: distance < .01 ? 0 : Math.max(-1, Math.min(1, (offsetX * Math.cos(yaw) - offsetZ * Math.sin(yaw)) / distance)),
    gain: 1 / (1 + distance / 42), cutoff: Math.max(500, 6500 / (1 + distance / 55)) };
}

/** Near-blast ducking depth in dB for music/engine/ambience buses: 0 beyond 60 m; at least 6 dB inside 30 m (up to 12 dB at the blast). */
export function duckDepthDb(distance: number): number {
  if (!(distance < 30)) return 0;
  return 6 + 6 * (1 - Math.max(0, distance) / 30);
}
/** Close-range pressure muffling: 1 at the blast, 0 at 25 m and beyond. */
export function blastProximity(distance: number): number {
  return distance < 25 ? 1 - Math.max(0, distance) / 25 : 0;
}

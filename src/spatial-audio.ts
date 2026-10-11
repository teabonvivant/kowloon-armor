interface Position { readonly x: number; readonly z: number }
export function spatialMix(listener: Position, yaw: number, source: Position): { pan: number; gain: number; cutoff: number } {
  const offsetX = source.x - listener.x, offsetZ = source.z - listener.z;
  const distance = Math.hypot(offsetX, offsetZ);
  return { pan: distance < .01 ? 0 : Math.max(-1, Math.min(1, (offsetX * Math.cos(yaw) - offsetZ * Math.sin(yaw)) / distance)),
    gain: 1 / (1 + distance / 42), cutoff: Math.max(500, 6500 / (1 + distance / 55)) };
}

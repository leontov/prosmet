let lastDurationMs = 0;

export function recordResponseDuration(durationMs: number) {
  lastDurationMs = Math.max(0, durationMs);
}

export function readResponseDuration() {
  return lastDurationMs;
}

export function formatResponseDuration(durationMs: number) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

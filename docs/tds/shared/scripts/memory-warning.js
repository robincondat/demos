export const WARNING_BYTES = 512 * 1024 * 1024;

export function estimateWorkingBytes(signals) {
  const counts = signals.map((signal) =>
    Math.max(1, Math.ceil((signal.end - signal.start) * signal.sampleRate - 1e-10)),
  );
  const total = counts.reduce((sum, count) => sum + count, 0);
  return 80 * total + (counts.length === 2 ? 48 * Math.max(0, total - 1) : 0);
}

export function createMemoryWarning(confirm) {
  let approvedBytes = WARNING_BYTES;
  return {
    check(signals) {
      if (signals.some((signal) => signal.end <= signal.start || signal.sampleRate <= 0))
        return true;
      const bytes = estimateWorkingBytes(signals);
      if (bytes <= approvedBytes) return true;
      const size = Number.isFinite(bytes)
        ? `environ ${Math.ceil(bytes / 1024 / 1024)} Mio`
        : "un volume très important";
      if (
        !confirm(
          `Ce calcul pourrait utiliser ${size}, en plus de la mémoire du navigateur et du moteur Python. Il peut ralentir ou saturer l’onglet.\n\nContinuer le calcul ?`,
        )
      )
        return false;
      approvedBytes = bytes;
      return true;
    },
    reset() {
      approvedBytes = WARNING_BYTES;
    },
  };
}

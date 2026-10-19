// État du réseau vu par l'application : navigator.onLine, plus un interrupteur « simuler hors ligne »
// propre à l'onglet (pratique en démonstration, sans ouvrir les outils du navigateur).
type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
let simulatedOffline = false;

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine && !simulatedOffline;
}
export function isSimulatedOffline() {
  return simulatedOffline;
}
export function setSimulatedOffline(v: boolean) {
  simulatedOffline = v;
  emit();
}
function emit() {
  const o = isOnline();
  listeners.forEach((l) => l(o));
}
export function onNetworkChange(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
if (typeof window !== "undefined") {
  window.addEventListener("online", emit);
  window.addEventListener("offline", emit);
}

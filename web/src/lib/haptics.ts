// Le corps répond (§18.27) : une vibration courte, là où le navigateur le
// permet (Android ; Safari l'ignore). Elle ne dépend pas du son ; elle est
// coupée par « mouvement réduit ».

export function buzz(ms = 12): void {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate?.(ms);
  } catch {
    /* refusée (aucun geste sur la page, iframe) : sans importance */
  }
}

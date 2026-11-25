/**
 * «Atrás» cierra primero lo que está encima (hojas, diálogos, el reproductor) y solo después
 * cambia de pantalla, como en cualquier app. Sirve para el botón atrás de Android (APK) y para
 * el gesto atrás del navegador o de la PWA: al abrirse una hoja se agrega una entrada al
 * historial, y si se cierra con su botón esa entrada se retira.
 */
let seq = 0;
const stack: { id: number; close: () => void }[] = [];

/** Cierra lo que esté encima. true si había algo que cerrar. */
export function closeTop(): boolean {
  const top = stack.at(-1);
  if (!top) return false;
  top.close();
  return true;
}

/** Registra algo que «atrás» debe cerrar. Devuelve la función para quitarlo al cerrarse. */
export function pushBack(close: () => void): () => void {
  const id = ++seq;
  stack.push({ id, close });
  try {
    history.pushState({ ...(history.state ?? {}), __sheet: id }, "");
  } catch { /* sin historial */ }
  return () => {
    const i = stack.findIndex((x) => x.id === id);
    if (i >= 0) stack.splice(i, 1);
    // Se cerró con su botón: retira su entrada, salvo que ya se haya navegado a otra pantalla
    // (o que se haya vuelto a montar enseguida, que pone su propia entrada encima).
    setTimeout(() => {
      if ((history.state as { __sheet?: number } | null)?.__sheet === id) history.back();
    }, 0);
  };
}

// Gesto atrás del navegador/PWA con una hoja abierta: la cierra (la URL no cambió).
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const top = stack.at(-1);
    const now = (history.state as { __sheet?: number } | null)?.__sheet ?? 0;
    if (top && top.id > now) return top.close();
    // Entrada de una hoja que ya no existe (se navegó desde ella): se salta, para que «atrás»
    // no muestre dos veces la misma pantalla.
    if (now && !stack.some((x) => x.id === now)) history.back();
  });
}

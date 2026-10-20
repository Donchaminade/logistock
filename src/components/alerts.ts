// Système unique de confirmations, retours et toasts : SweetAlert2, thème bleu / noir / blanc.
import Swal, { type SweetAlertIcon } from "sweetalert2";

const modal = Swal.mixin({
  buttonsStyling: false,
  reverseButtons: true,
  focusCancel: false,
  customClass: {
    popup: "ls-popup",
    confirmButton: "ls-btn ls-btn-primary",
    cancelButton: "ls-btn ls-btn-ghost",
    denyButton: "ls-btn ls-btn-dark",
  },
});

const toastMixin = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 4200,
  timerProgressBar: true,
  customClass: { popup: "ls-toast" },
  didOpen: (el) => {
    el.addEventListener("mouseenter", Swal.stopTimer);
    el.addEventListener("mouseleave", Swal.resumeTimer);
  },
});

const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const TOAST_ICON: Record<string, string> = {
  success: svg('<path d="M20 6 9 17l-5-5"/>'),
  error: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  warning: svg('<path d="M12 8v5M12 16.5v.01"/>'),
  info: svg('<path d="M12 10.5V17M12 7h.01"/>'),
  question: svg('<path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01"/>'),
};

type ToastItem = { icon: SweetAlertIcon; title: string; text?: string; onClick?: () => void };
const queue: ToastItem[] = [];
let flushing = false;

function modalOpen() {
  return Swal.isVisible() && !Swal.getPopup()?.classList.contains("swal2-toast");
}

async function flush() {
  if (flushing) return;
  flushing = true;
  while (queue.length) {
    if (modalOpen()) {
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    const t = queue.shift()!;
    await toastMixin.fire({
      icon: t.icon,
      iconHtml: TOAST_ICON[t.icon],
      customClass: { popup: "ls-toast", icon: `ls-ticon ls-ticon-${t.icon}` },
      title: t.title,
      text: t.text,
      didOpen: (el) => {
        el.addEventListener("mouseenter", Swal.stopTimer);
        el.addEventListener("mouseleave", Swal.resumeTimer);
        if (t.onClick) {
          el.style.cursor = "pointer";
          el.addEventListener("click", () => {
            Swal.close();
            t.onClick?.();
          });
        }
      },
    });
  }
  flushing = false;
}

/** Toast (succès, information, erreur). Mis en file si une boîte de dialogue est ouverte. */
export function toast(title: string, text?: string, icon: SweetAlertIcon = "success", onClick?: () => void) {
  queue.push({ icon, title, text, onClick });
  void flush();
}

export async function success(title: string, html?: string) {
  await modal.fire({ icon: "success", title, html, confirmButtonText: "Continuer" });
}

export async function info(title: string, html?: string) {
  await modal.fire({ icon: "info", title, html, confirmButtonText: "Compris" });
}

export async function fail(err: unknown, title = "Action impossible") {
  const msg = err instanceof Error ? err.message : String(err);
  await modal.fire({ icon: "error", title, text: msg, confirmButtonText: "Fermer", customClass: { popup: "ls-popup", confirmButton: "ls-btn ls-btn-dark" } });
}

export async function confirm(opts: { title: string; html?: string; confirmText?: string; cancelText?: string; icon?: SweetAlertIcon; dark?: boolean }) {
  const r = await modal.fire({
    icon: opts.icon ?? "question",
    title: opts.title,
    html: opts.html,
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? "Confirmer",
    cancelButtonText: opts.cancelText ?? "Annuler",
    customClass: { popup: "ls-popup", confirmButton: `ls-btn ${opts.dark ? "ls-btn-dark" : "ls-btn-primary"}`, cancelButton: "ls-btn ls-btn-ghost" },
  });
  return r.isConfirmed;
}

/** Demande un motif (obligatoire) — suppressions, refus, demandes à confirmer. */
export async function askReason(opts: { title: string; html?: string; confirmText?: string; placeholder?: string; dark?: boolean; optional?: boolean }) {
  const r = await modal.fire({
    icon: "warning",
    title: opts.title,
    html: opts.html,
    input: "textarea",
    inputPlaceholder: opts.placeholder ?? "Motif (obligatoire)",
    inputAttributes: { "aria-label": "Motif" },
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? "Envoyer",
    cancelButtonText: "Annuler",
    customClass: { popup: "ls-popup", confirmButton: `ls-btn ${opts.dark ? "ls-btn-dark" : "ls-btn-primary"}`, cancelButton: "ls-btn ls-btn-ghost" },
    inputValidator: (v: string) => (!opts.optional && (!v || v.trim().length < 3) ? "Indiquez un motif d'au moins 3 caractères." : undefined),
  });
  return r.isConfirmed ? String(r.value ?? "") : null;
}

export async function askText(opts: { title: string; html?: string; input?: "text" | "password"; placeholder?: string; confirmText?: string; validate?: (v: string) => string | undefined; allowCancel?: boolean }) {
  const r = await modal.fire({
    icon: "info",
    title: opts.title,
    html: opts.html,
    input: opts.input ?? "text",
    inputPlaceholder: opts.placeholder,
    showCancelButton: opts.allowCancel ?? true,
    allowOutsideClick: opts.allowCancel ?? true,
    allowEscapeKey: opts.allowCancel ?? true,
    confirmButtonText: opts.confirmText ?? "Valider",
    cancelButtonText: "Annuler",
    inputValidator: (v: string) => opts.validate?.(v ?? ""),
  });
  return r.isConfirmed ? String(r.value ?? "") : null;
}

export async function viewImage(src: string, title?: string) {
  await modal.fire({ title, imageUrl: src, imageAlt: title ?? "Preuve", confirmButtonText: "Fermer", width: "min(44rem, calc(100vw - 2rem))" });
}

export async function loading<T>(title: string, fn: () => Promise<T>): Promise<T> {
  void modal.fire({ title, allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
  try {
    return await fn();
  } finally {
    Swal.close();
  }
}

/** Choix à deux actions (confirmer / autre action) + annuler. */
export async function choose(opts: { title: string; html?: string; confirmText: string; denyText?: string; cancelText?: string; icon?: SweetAlertIcon }) {
  const r = await modal.fire({
    icon: opts.icon ?? "info",
    title: opts.title,
    html: opts.html,
    showCancelButton: true,
    showDenyButton: !!opts.denyText,
    confirmButtonText: opts.confirmText,
    denyButtonText: opts.denyText,
    cancelButtonText: opts.cancelText ?? "Fermer",
    customClass: { popup: "ls-popup", confirmButton: "ls-btn ls-btn-dark", denyButton: "ls-btn ls-btn-primary", cancelButton: "ls-btn ls-btn-ghost" },
  });
  return r.isConfirmed ? "confirm" : r.isDenied ? "deny" : null;
}

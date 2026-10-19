"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Camera, ImageIcon, Loader2, X } from "lucide-react";
import { resolvePhoto, savePhoto } from "@/services/actions";
import { viewImage, fail } from "./alerts";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "dark" | "quiet";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 border border-brand-600",
  secondary: "bg-white text-ink border border-line-2 hover:bg-canvas",
  ghost: "bg-transparent text-ink hover:bg-ink/5 border border-transparent",
  dark: "bg-ink text-white hover:bg-ink-3 border border-ink",
  quiet: "bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-100",
};

export function Button({
  variant = "primary", size = "md", icon, loading, className, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: ReactNode; loading?: boolean }) {
  const sizes = { sm: "h-9 px-3 text-[13px] gap-1.5 rounded-lg", md: "h-11 px-4 text-[14px] gap-2 rounded-xl", lg: "h-12 px-5 text-[15px] gap-2 rounded-xl" };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        sizes[size], VARIANTS[variant], className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "secondary", size = "md", icon, children, className }: { href: string; variant?: Variant; size?: "sm" | "md"; icon?: ReactNode; children: ReactNode; className?: string }) {
  const sizes = { sm: "h-9 px-3 text-[13px] gap-1.5 rounded-lg", md: "h-11 px-4 text-[14px] gap-2 rounded-xl" };
  return (
    <Link href={href} className={cx("inline-flex items-center justify-center whitespace-nowrap font-semibold transition-colors", sizes[size], VARIANTS[variant], className)}>
      {icon}
      {children}
    </Link>
  );
}

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <section className={cx("card", pad && "p-5 sm:p-6", className)}>{children}</section>;
}

export function CardTitle({ title, sub, action, icon }: { title: string; sub?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type Tone = "blue" | "dark" | "gray" | "outline" | "ok" | "err";
const TONES: Record<Tone, string> = {
  blue: "bg-brand-50 text-brand-700 ring-brand-100",
  dark: "bg-ink text-white ring-ink",
  gray: "bg-canvas text-muted ring-line",
  outline: "bg-white text-ink ring-line-2",
  ok: "bg-ok-bg text-ok ring-ok/15",
  err: "bg-err-bg text-err ring-err/15",
};
export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ring-inset", TONES[tone], className)}>{children}</span>;
}

export function PageHeader({ title, sub, actions, back, eyebrow }: { title: string; sub?: ReactNode; actions?: ReactNode; back?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="animate-in mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[24px] font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[28px]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted sm:text-[15px]">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon, accent }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; accent?: boolean }) {
  return (
    <div className={cx("rounded-2xl border p-4 sm:p-5", accent ? "border-ink bg-ink text-white" : "border-line bg-white")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cx("text-[12.5px] font-medium", accent ? "text-white/70" : "text-muted")}>{label}</span>
        {icon && <span className={cx("grid size-8 place-items-center rounded-lg", accent ? "bg-white/10 text-white" : "bg-brand-50 text-brand-700")}>{icon}</span>}
      </div>
      <div className="num mt-2 text-[20px] font-bold leading-tight tracking-[-0.02em] sm:text-[22px]">{value}</div>
      {hint && <div className={cx("num mt-1 text-[12.5px]", accent ? "text-white/60" : "text-subtle")}>{hint}</div>}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-2 bg-white px-6 py-12 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-canvas text-muted">{icon}</div>
      <p className="text-[15px] font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[13.5px] text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}>
      <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12.5px] text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx("field h-11", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx("field h-11 appearance-none bg-[length:16px] bg-[right_0.8rem_center] bg-no-repeat pr-9", props.className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235d6472' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx("field", props.className)} />;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40", checked ? "bg-brand-600" : "bg-line-2")}
    >
      <span className={cx("inline-block size-5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-canvas p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx("h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors", value === o.value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-line" : "text-muted hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex min-w-full gap-1 border-b border-line sm:min-w-0">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cx("relative -mb-px flex h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[14px] font-semibold transition-colors", value === t.value ? "border-brand-600 text-ink" : "border-transparent text-muted hover:text-ink")}
          >
            {t.label}
            {t.count !== undefined && <span className={cx("num rounded-full px-1.5 text-[11px]", value === t.value ? "bg-brand-600 text-white" : "bg-line text-muted")}>{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function KV({ items, cols = 2 }: { items: { k: string; v: ReactNode }[]; cols?: 2 | 3 }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-4", cols === 3 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2")}>
      {items.map((i) => (
        <div key={i.k} className="min-w-0">
          <dt className="text-[12.5px] text-muted">{i.k}</dt>
          <dd className="num mt-0.5 truncate text-[14.5px] font-semibold text-ink">{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Avatar({ name, size = "md", dark }: { name: string; size?: "sm" | "md" | "lg"; dark?: boolean }) {
  const s = { sm: "size-7 text-[11px]", md: "size-9 text-[12.5px]", lg: "size-12 text-[15px]" }[size];
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return <span className={cx("grid shrink-0 place-items-center rounded-full font-bold", s, dark ? "bg-white text-ink" : "bg-ink text-white")}>{ini}</span>;
}

/** Fenêtre de saisie : feuille en bas sur téléphone, boîte centrée sur ordinateur. */
export function Modal({ open, onClose, title, sub, children, footer, wide }: { open: boolean; onClose: () => void; title: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-fade absolute inset-0 bg-ink/55" onClick={onClose} />
      <div className={cx("animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white sm:rounded-3xl", wide ? "sm:max-w-3xl" : "sm:max-w-xl")}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-5 sm:px-7">
          <div>
            <h2 className="text-[17px] font-bold tracking-[-0.015em]">{title}</h2>
            {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
          </div>
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink" aria-label="Fermer">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-7">{children}</div>
        {footer && <div className="pb-safe flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-7">{footer}</div>}
      </div>
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "right";
  /** Rôle de la colonne dans la vue carte mobile. */
  mobile?: "title" | "sub" | "value" | "meta" | "hide";
}

/** Tableau sur ordinateur, liste de cartes sur téléphone. */
export function DataTable<T>({ rows, columns, rowKey, onRow, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRow?: (r: T) => void; empty?: ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  const title = columns.find((c) => c.mobile === "title");
  const sub = columns.find((c) => c.mobile === "sub");
  const value = columns.find((c) => c.mobile === "value");
  const meta = columns.filter((c) => c.mobile === "meta");
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-white md:block">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-line bg-canvas/60">
              {columns.map((c) => (
                <th key={c.key} className={cx("px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-subtle", c.align === "right" && "text-right")}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={cx("border-b border-line last:border-0 transition-colors", onRow && "cursor-pointer hover:bg-brand-50/40")}>
                {columns.map((c) => (
                  <td key={c.key} className={cx("num px-4 py-3.5 align-middle", c.align === "right" && "text-right")}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2.5 md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)}>
            <div onClick={onRow ? () => onRow(r) : undefined} className={cx("card p-4", onRow && "cursor-pointer active:bg-canvas")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {title && <div className="truncate text-[15px] font-semibold">{title.render(r)}</div>}
                  {sub && <div className="mt-0.5 truncate text-[13px] text-muted">{sub.render(r)}</div>}
                </div>
                {value && <div className="num shrink-0 text-right text-[14px] font-semibold">{value.render(r)}</div>}
              </div>
              {meta.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[12.5px] text-muted">
                  {meta.map((m) => (
                    <span key={m.key} className="num inline-flex items-center gap-1.5">
                      <span className="text-subtle">{m.header}</span>
                      <span className="font-medium text-ink">{m.render(r)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Miniature de preuve (photo IndexedDB ou image de démo), agrandissable. */
export function Photo({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    if (src) void resolvePhoto(src).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [src]);
  if (!src) return null;
  return (
    <button type="button" onClick={() => url && viewImage(url, alt)} className={cx("group relative overflow-hidden rounded-xl border border-line bg-canvas", className ?? "size-16")} aria-label={`Voir : ${alt}`}>
      {url ? <img src={url} alt={alt} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <Skeleton className="size-full" />}
    </button>
  );
}

const DEMO_PHOTOS = [
  { src: "/demo/remise.svg", label: "Remise d'espèces" },
  { src: "/demo/sacs.svg", label: "Sacs pesés" },
  { src: "/demo/ticket.svg", label: "Ticket de pesée" },
  { src: "/demo/chargement.svg", label: "Chargement" },
];

async function compress(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const max = 1280;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * k);
  canvas.height = Math.round(img.height * k);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

/** Ajout d'une photo : appareil photo / galerie (compressée puis stockée dans IndexedDB) ou image de démo. */
export function PhotoInput({ value, onChange, label = "Photo" }: { value?: string; onChange: (ref: string | undefined) => void; label?: string }) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas/50 p-2.5">
          <Photo src={value} alt={label} className="size-14" />
          <div className="min-w-0 flex-1 text-[13px]">
            <div className="font-semibold">Preuve jointe</div>
            <div className="truncate text-muted">{value.startsWith("idb:") ? "Photo enregistrée sur l'appareil" : "Image de démonstration"}</div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>Retirer</Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <input
            id={id}
            ref={ref}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            data-testid="photo-file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try {
                onChange(await savePhoto(await compress(f)));
              } catch (err) {
                await fail(err, "Photo non enregistrée");
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
          <Button type="button" variant="secondary" className="w-full" icon={<Camera className="size-4" />} loading={busy} onClick={() => ref.current?.click()}>
            Prendre ou choisir une photo
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-subtle">ou image de démo :</span>
            {DEMO_PHOTOS.map((p) => (
              <button key={p.src} type="button" onClick={() => onChange(p.src)} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[12px] font-medium text-ink hover:border-brand-600 hover:text-brand-700">
                <ImageIcon className="size-3.5" />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Divider() {
  return <div className="my-5 h-px bg-line" />;
}

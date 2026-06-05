import type { ReactNode } from "react";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Tons sémantiques compatibles clair/sombre. */
const TONE = {
  success:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25",
  warn: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25",
  info: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/25",
  neutral:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/25",
  danger: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/25",
} as const;

export const alertError = `rounded-lg border px-3 py-2 text-sm ${TONE.danger}`;
export const alertSuccess = `rounded-lg border px-3 py-2 text-sm ${TONE.success}`;

/** Pastille de statut colorée et lisible (toujours avec libellé texte, pas seulement la couleur). */
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: keyof typeof TONE }> = {
    paid: { label: "Payé", tone: "success" },
    completed: { label: "Payé", tone: "success" },
    active: { label: "Actif", tone: "success" },
    pending_payment: { label: "En attente", tone: "warn" },
    waiting_address_selection: { label: "En attente", tone: "warn" },
    pending: { label: "En attente", tone: "warn" },
    confirming: { label: "Confirmation…", tone: "info" },
    sent: { label: "Envoyée", tone: "info" },
    creating: { label: "Création…", tone: "neutral" },
    expired: { label: "Expiré", tone: "neutral" },
    inactive: { label: "Inactif", tone: "neutral" },
    irregular: { label: "À vérifier", tone: "warn" },
    amount_mismatch: { label: "Montant incohérent", tone: "danger" },
    error: { label: "Erreur", tone: "danger" },
  };
  const v = map[status] ?? { label: "En attente", tone: "warn" as const };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE[v.tone],
      )}
    >
      {v.label}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      aria-hidden
    />
  );
}

export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

export const buttonGhost =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

export const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

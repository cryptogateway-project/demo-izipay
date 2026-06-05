"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Spinner, StatusPill, buttonGhost, buttonPrimary } from "../../../_components/ui";
import { formatAmount } from "@/lib/money";

interface Status {
  id: string;
  status: string;
  amount?: string;
  currency?: string;
  paymentLink?: string;
  izipayId?: string;
  paidAt?: string;
  eventsCount: number;
  reconciledFrom: "webhook" | "api";
}

const TERMINAL = new Set([
  "paid",
  "completed",
  "expired",
  "error",
  "irregular",
  "amount_mismatch",
]);

export function OrderStatus({ id }: { id: string }) {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/status/${id}`, { cache: "no-store" });
        const json = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(json.error || `Erreur ${res.status}`);
          return;
        }
        setData(json);
        if (!TERMINAL.has(json.status)) timer = setTimeout(poll, 3000);
      } catch (err) {
        if (active) setError((err as Error).message);
      }
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id]);

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
        <p className="font-semibold">Impossible de récupérer le statut</p>
        <p className="mt-1 text-sm">{error}</p>
        <Link href="/" className={`${buttonGhost} mt-4`}>
          ← Retour à la boutique
        </Link>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="flex items-center gap-3">
        <Spinner /> <span className="text-sm text-[var(--muted)]">Chargement…</span>
      </Card>
    );
  }

  const paid = data.status === "paid" || data.status === "completed";
  const expired = data.status === "expired";
  const confirming = data.status === "confirming";
  const irregular = data.status === "irregular";
  const mismatch = data.status === "amount_mismatch";

  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Commande</p>
          <p className="font-mono text-sm">{data.id}</p>
        </div>
        <StatusPill status={data.status} />
      </div>

      <div className="text-center">
        {paid ? (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              ✓
            </div>
            <h1 className="mt-3 text-xl font-bold">Paiement reçu</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {data.amount ? formatAmount(data.amount, data.currency) : ""} confirmé via{" "}
              {data.reconciledFrom === "webhook" ? "webhook" : "réconciliation API"}.
            </p>
          </>
        ) : expired ? (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-slate-200 text-2xl dark:bg-slate-500/20">
              ⏱
            </div>
            <h1 className="mt-3 text-xl font-bold">Paiement expiré</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Le délai est écoulé sans paiement suffisant.
            </p>
          </>
        ) : mismatch ? (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-rose-100 text-2xl dark:bg-rose-500/15">
              ⚠️
            </div>
            <h1 className="mt-3 text-xl font-bold">Montant inattendu</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Le montant reçu ne correspond pas à cette commande. Le paiement n&apos;a pas été validé
              automatiquement — une vérification manuelle est requise.
            </p>
          </>
        ) : irregular ? (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl dark:bg-amber-500/15">
              ⚠️
            </div>
            <h1 className="mt-3 text-xl font-bold">Paiement à vérifier</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Paiement reçu hors de la plage acceptée. En attente d&apos;une décision (encaissement
              ou remboursement) côté plateforme.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex size-14 items-center justify-center">
              <Spinner className="size-8 text-[var(--accent)]" />
            </div>
            <h1 className="mt-3 text-xl font-bold">
              {confirming ? "Paiement détecté" : "Confirmation en cours…"}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {confirming
                ? "Transaction reçue, confirmation réseau en cours. Cette page se met à jour automatiquement."
                : "En attente du paiement on-chain. Cette page se met à jour automatiquement."}
            </p>
          </>
        )}
      </div>

      <dl className="space-y-1 border-t border-[var(--border)] pt-4 text-sm">
        {data.amount ? (
          <Row label="Montant" value={formatAmount(data.amount, data.currency)} />
        ) : null}
        {data.izipayId ? <Row label="Intent" value={data.izipayId} mono /> : null}
        <Row label="Webhooks reçus" value={String(data.eventsCount)} />
      </dl>

      {!paid && !expired && !irregular && !mismatch && data.paymentLink ? (
        <a href={data.paymentLink} className={`${buttonPrimary} w-full`}>
          Reprendre le paiement →
        </a>
      ) : null}

      <Link href="/" className={`${buttonGhost} w-full`}>
        Continuer mes achats
      </Link>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : "font-medium"}>{value}</dd>
    </div>
  );
}

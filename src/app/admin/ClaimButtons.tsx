"use client";

import { useTransition } from "react";
import { decideClaimAction, unlinkProfileAction } from "@/app/actions";

export function ClaimDecision({ claimId }: { claimId: string }) {
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideClaimAction(claimId, approve);
      if (!r.ok) alert(r.error);
    });
  return (
    <div className="flex gap-2">
      <button disabled={pending} onClick={() => decide(true)}
        className="btn btn-primary btn-sm">Approve</button>
      <button disabled={pending} onClick={() => decide(false)}
        className="btn btn-secondary btn-sm">Reject</button>
    </div>
  );
}

export function UnlinkButton({ playerId, name }: { playerId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className="btn btn-danger btn-sm"
      onClick={() => {
        if (!confirm(`Disconnect ${name} from the account that claimed it?`)) return;
        start(async () => {
          const r = await unlinkProfileAction(playerId);
          if (!r.ok) alert(r.error);
        });
      }}
    >
      {pending ? "…" : "Unlink"}
    </button>
  );
}

"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/app/actions";

type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;

/** A form wired to a server action that shows its success or error message. */
export default function ActionForm({
  action,
  submit,
  children,
  className = "space-y-3",
}: {
  action: Action;
  submit: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold hover:bg-rose-500 disabled:opacity-50"
        >
          {pending ? "Working…" : submit}
        </button>
        {state && (
          <span className={`text-sm ${state.ok ? "text-teal-400" : "text-red-400"}`}>
            {state.ok ? state.message : state.error}
          </span>
        )}
      </div>
    </form>
  );
}

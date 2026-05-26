"use client";

import { CheckIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Absolutely-positioned loading overlay.
 *
 * Drops on top of its parent (which must be `position: relative`
 * and clip its overflow — `<Modal>`'s panel and the cart drawer's
 * body wrapper both do) and dims everything below with a blurred
 * white scrim. Reused across every surface where a server round-
 * trip is the canonical "thinking" feedback rather than optimistic
 * UI (modal-form submits, cart-drawer mutations). One look, one
 * cadence, no per-caller theming — call sites just toggle `state`.
 *
 * States the caller toggles between:
 *
 *   - `null`        — overlay hidden, inputs reachable.
 *   - `"loading"`   — spinner + optional label.
 *   - `"success"`   — confirming check disc + optional label.
 *
 * Typical wiring:
 *
 *   const state =
 *     success ? "success"
 *     : pending ? "loading"
 *     : null;
 *
 *   <LoadingOverlay
 *     state={state}
 *     loadingLabel="Posting…"
 *     successLabel="Posted!"
 *   />
 *
 * Colours come from global tokens (brand for the spinner, success
 * for the check disc) so the overlay slots into any panel without
 * a per-caller theme prop.
 */

export type LoadingOverlayState = "loading" | "success";

export interface LoadingOverlayProps {
  state: LoadingOverlayState | null;
  loadingLabel?: string;
  successLabel?: string;
  /** Extra classes on the overlay root — useful for matching the
   *  parent's corner radius (e.g. `rounded-2xl`) when the parent
   *  doesn't clip overflow on its own. */
  className?: string;
}

export function LoadingOverlay({
  state,
  loadingLabel,
  successLabel,
  className,
}: LoadingOverlayProps) {
  const visible = state !== null;

  return (
    <div
      aria-hidden={!visible}
      role={state === "loading" ? "status" : undefined}
      className={cn(
        "absolute inset-0 z-10 flex flex-col items-center justify-center gap-3",
        "bg-[color:var(--color-surface)]/85 backdrop-blur-sm",
        "transition-opacity duration-200",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
        className,
      )}
    >
      {state === "loading" && (
        <>
          <Spinner size="lg" className="text-[color:var(--color-brand)]" />
          {loadingLabel && (
            <p className="text-sm font-medium text-[color:var(--color-ink)]">
              {loadingLabel}
            </p>
          )}
        </>
      )}

      {state === "success" && (
        <>
          {/* Pop-in disc — reuses the modal-in keyframe so we don't
           *  add an animation token for a single use. Brand-soft
           *  tokens match the "Your review" pill so the success
           *  flash reads as part of the same family. */}
          <span className="inline-flex h-12 w-12 animate-modal-in items-center justify-center rounded-full bg-[color:var(--color-brand-light)] text-[color:var(--color-brand)]">
            <CheckIcon className="h-7 w-7" />
          </span>
          {successLabel && (
            <p className="animate-modal-in text-sm font-medium text-[color:var(--color-ink)]">
              {successLabel}
            </p>
          )}
        </>
      )}
    </div>
  );
}

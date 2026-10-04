"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ClaimStatus } from "@/lib/app/types";
import { cn } from "@/lib/utils";

export const CLAIM_TEXT: Record<ClaimStatus, string> = {
  verified: "Verified",
  assumption: "Assumption",
  unresolved: "Unresolved",
};

const TONE: Record<ClaimStatus, string> = {
  verified: "text-ink",
  assumption: "text-ink-muted",
  unresolved: "text-brand",
};

export const CLAIM_HELP: Record<ClaimStatus, string> = {
  verified:
    "Matches an SFU calendar page, but hasn't been reviewed by an advisor.",
  assumption: "Something MyAdvisor assumed. Check it if it matters to you.",
  unresolved: "MyAdvisor can't check this yet. Ask an advisor.",
};

const LABEL =
  "text-[11px] font-semibold tracking-[0.06em] uppercase rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** VERIFIED / ASSUMPTION / UNRESOLVED, with what it means on hover or keyboard focus. */
export function ClaimLabel({ status }: { status: ClaimStatus }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          className={cn(LABEL, TONE[status], "cursor-help self-start")}
          aria-label={`${CLAIM_TEXT[status]}: ${CLAIM_HELP[status]}`}
        >
          {CLAIM_TEXT[status]}
        </TooltipTrigger>
        <TooltipContent>{CLAIM_HELP[status]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

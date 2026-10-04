"use client";

import { ErrorPanel } from "@/components/app/error-panel";

export default function StartError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel {...props} title="We couldn't load this step." />;
}

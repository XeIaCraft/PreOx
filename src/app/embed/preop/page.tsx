import { Suspense } from "react";
import { PreopApp } from "@/components/preop/preop-app";

export default function EmbeddedPreopPage() {
  return (
    <Suspense fallback={null}>
      <PreopApp embedded />
    </Suspense>
  );
}

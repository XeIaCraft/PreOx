import { Suspense } from "react";
import { PreopApp } from "@/components/preop/preop-app";

// One client-side app (consultation, rule library, rule wizard); the
// current screen lives in ?v=, read with useSearchParams — hence Suspense.
export default function PreopPage() {
  return (
    <Suspense fallback={null}>
      <PreopApp />
    </Suspense>
  );
}

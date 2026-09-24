import { Suspense } from "react";
import { CarnetApp } from "@/components/carnet/carnet-app";

// The whole module is one client-side app over the local-first store
// (CarnetProvider in layout.tsx): switching screens never goes back to the
// server, and everything keeps working offline once loaded. useSearchParams
// (the current screen lives in ?v=) needs a Suspense boundary.
export default function CarnetPage() {
  return (
    <Suspense fallback={null}>
      <CarnetApp />
    </Suspense>
  );
}

import { SCHLoaderOverlay } from "@/components/sch-loader";

export default function Loading() {
  // Infinite spin (no checkmark) — unmounts automatically when the route is ready.
  return <SCHLoaderOverlay autoCompleteMs={0} label="Loading admin console" />;
}

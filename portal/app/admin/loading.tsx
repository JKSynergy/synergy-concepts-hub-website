export default function Loading() {
  // Quiet wait state. The thin top progress bar carries navigation feedback;
  // no full-screen loader or animation blocks the page.
  return (
    <div className="ux-loading" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

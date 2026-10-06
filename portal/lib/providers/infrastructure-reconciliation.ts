export type InfrastructureEvidence = {
  provider: string;
  providerKey: string | null;
  resourceName: string;
  resourceType: string;
  status: string | null;
  externalMissing: boolean;
  retired: boolean;
  metadata: Record<string, unknown> | null;
  mappingIssue?: string | null;
};

export type SystemInfrastructureInput = {
  systemName: string;
  client: string;
  resources: InfrastructureEvidence[];
};

export type SystemInfrastructureAssessment = SystemInfrastructureInput & {
  railway: InfrastructureEvidence[];
  vercel: InfrastructureEvidence[];
  other: InfrastructureEvidence[];
  missing: string[];
  context: string[];
  possibleDuplicatesOrLegacy: string[];
  potentiallyIncorrect: string[];
  assessment: "Complete" | "Partial" | "Uncertain";
};

const EXPECTATIONS: Record<string, { railway: boolean; vercel: boolean; note?: string; railwayLimit?: number }> = {
  "sma learning management system": { railway: true, vercel: true, railwayLimit: 2 },
  "elgon bms": { railway: true, vercel: true },
  "solvers bookings management system": { railway: true, vercel: true },
  "diani art gallery": { railway: true, vercel: true },
  "quickcredit loan management system": { railway: true, vercel: false, note: "Frontend is hosted on Netlify; no Vercel project is required." },
};

const LEGACY_MARKERS = /(^|[\s_-])(old|legacy|experimental|unused|archive|archived|test)([\s_-]|$)/i;

export function reconcileSystemInfrastructure(input: SystemInfrastructureInput): SystemInfrastructureAssessment {
  const active = input.resources.filter((resource) => !resource.retired);
  const railway = active.filter((resource) => resource.providerKey === "railway");
  const vercel = active.filter((resource) => resource.providerKey === "vercel");
  const other = active.filter((resource) => resource.providerKey !== "railway" && resource.providerKey !== "vercel");
  const expectation = EXPECTATIONS[input.systemName.trim().toLowerCase()];
  const missing: string[] = [];
  const context = expectation?.note ? [expectation.note] : [];
  const possibleDuplicatesOrLegacy: string[] = [];
  const potentiallyIncorrect: string[] = [];

  if (expectation?.railway && railway.length === 0) missing.push("No linked Railway project evidence");
  if (expectation?.vercel && vercel.length === 0) missing.push("No linked Vercel project evidence");
  if (!expectation && railway.length === 0 && vercel.length === 0 && other.length === 0) {
    missing.push("No linked provider infrastructure evidence");
  }
  if (!expectation && active.length > 0 && railway.length === 0) missing.push("No linked Railway project evidence; requirement is unconfirmed");
  if (!expectation && active.length > 0 && vercel.length === 0) missing.push("No linked Vercel project evidence; requirement is unconfirmed");

  for (const resource of input.resources) {
    if (resource.retired) possibleDuplicatesOrLegacy.push(`${resource.provider}: ${resource.resourceName} is retired`);
    if (resource.externalMissing) potentiallyIncorrect.push(`${resource.provider}: ${resource.resourceName} is missing externally`);
    if (resource.mappingIssue) potentiallyIncorrect.push(resource.mappingIssue);
    if (LEGACY_MARKERS.test(resource.resourceName)) possibleDuplicatesOrLegacy.push(`${resource.provider}: ${resource.resourceName} appears legacy or experimental`);
    if (resource.resourceType !== "web_app" && resource.providerKey === "vercel") {
      potentiallyIncorrect.push(`Vercel: ${resource.resourceName} has unexpected SCH resource type ${resource.resourceType}`);
    }
  }

  const railwayLimit = expectation?.railwayLimit ?? 1;
  if (railway.length > railwayLimit) possibleDuplicatesOrLegacy.push(`${railway.length} Railway projects are linked; verify that each has a distinct production role`);
  if (vercel.length > 1) possibleDuplicatesOrLegacy.push(`${vercel.length} Vercel projects are linked; verify that each has a distinct production role`);

  const requiredSatisfied = expectation
    ? (!expectation.railway || railway.length > 0) && (!expectation.vercel || vercel.length > 0)
    : railway.length > 0 && vercel.length > 0;
  const hasRisk = possibleDuplicatesOrLegacy.length > 0 || potentiallyIncorrect.length > 0;
  const assessment = requiredSatisfied && !hasRisk
    ? "Complete"
    : active.length > 0
      ? "Partial"
      : "Uncertain";

  return {
    ...input,
    railway,
    vercel,
    other,
    missing,
    context,
    possibleDuplicatesOrLegacy: [...new Set(possibleDuplicatesOrLegacy)],
    potentiallyIncorrect: [...new Set(potentiallyIncorrect)],
    assessment,
  };
}

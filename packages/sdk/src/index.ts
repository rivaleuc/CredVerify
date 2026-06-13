import type { Address } from "viem";

// ─── Types ───────────────────────────────────────────────────────────

export interface RoleRequirements {
  title: string;
  requirements: string;
  githubWeight: number; // 0-100
  minScore: number;     // 0-100
}

export interface VerificationResult {
  score: number;
  qualified: boolean;
  strengths: string;
  gaps: string;
  reasoning: string;
}

export interface CandidateProfile {
  githubUsername: string;
  linkedinUrl?: string;
  extraNotes?: string;
}

// ─── Logic ───────────────────────────────────────────────────────────

/** Validate role requirements before on-chain submission. */
export function validateRequirements(req: RoleRequirements): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!req.title.trim()) issues.push("Title required");
  if (req.requirements.length < 20) issues.push("Requirements too vague — add specific skills/experience");
  if (req.requirements.length > 2000) issues.push("Requirements too long (max 2000 chars)");
  if (req.githubWeight < 0 || req.githubWeight > 100) issues.push("GitHub weight must be 0-100");
  if (req.minScore < 10) issues.push("Min score too low — consider 40+ for meaningful filtering");
  if (req.minScore > 95) issues.push("Min score unrealistically high — few candidates will pass");
  return { valid: issues.length === 0, issues };
}

/** Estimate pass likelihood based on requirements complexity. */
export function estimateDifficulty(requirements: string): "easy" | "moderate" | "hard" | "expert" {
  const words = requirements.split(/\s+/).length;
  const hasYears = /\d+\+?\s*years?/i.test(requirements);
  const hasSpecific = /\b(contributed|maintained|built|shipped|deployed)\b/i.test(requirements);
  const requirementCount = (requirements.match(/\b(must|should|need|require)\b/gi) || []).length;

  let score = 0;
  if (hasYears) score += 2;
  if (hasSpecific) score += 2;
  score += Math.min(3, requirementCount);
  if (words > 100) score += 1;

  if (score <= 2) return "easy";
  if (score <= 4) return "moderate";
  if (score <= 6) return "hard";
  return "expert";
}

/** Build GitHub profile URL from username. */
export function githubProfileUrl(username: string): string {
  return `https://github.com/${username.replace(/^@/, "")}`;
}

/** Parse a requirements string into individual items. */
export function parseRequirements(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

/** Calculate match percentage between candidate strengths and requirements. */
export function matchPercentage(requirements: string[], strengths: string): number {
  const strengthLower = strengths.toLowerCase();
  let matched = 0;
  for (const req of requirements) {
    const keywords = req.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (keywords.some((k) => strengthLower.includes(k))) matched++;
  }
  return requirements.length > 0 ? Math.round((matched / requirements.length) * 100) : 0;
}

// ─── ABIs ────────────────────────────────────────────────────────────

export const hireGateAbi = [
  {
    type: "function",
    name: "createRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "title", type: "string" },
      { name: "genLayerRoleKey", type: "uint256" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "grant",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roleId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "revoke",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roleId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isQualified",
    stateMutability: "view",
    inputs: [
      { name: "roleId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getUserRoles",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "event",
    name: "AccessGranted",
    inputs: [
      { name: "roleId", type: "uint256", indexed: true },
      { name: "account", type: "address", indexed: true },
    ],
  },
] as const;

export interface CVDeployment {
  chainId: number;
  hireGate: Address;
  genlayerContract: string;
}

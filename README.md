# CredVerify

Decentralized credential verification for trustless hiring. DAOs define role requirements, candidates provide their GitHub username, and GenLayer AI validators fetch the profile and judge qualification — no résumés, no HR middlemen.

## Why this exists

Hiring in DAOs is broken. Either you trust a single person's judgment, or you require a centralized credential service. CredVerify decentralizes the entire process: AI validators independently fetch candidates' public profiles, evaluate them against role requirements, and reach consensus. The result is an on-chain credential that HireGate uses to grant access.

## Architecture

```
┌─────────────────────┐         ┌──────────────────────────────┐
│    HireGate         │         │   CredVerify.py              │
│    (Base / EVM)     │◄────────│   (GenLayer)                 │
│                     │  reads  │                              │
│  • grant(role,addr) │ verdict │  • create_role(title,reqs)   │
│  • isQualified()    │         │  • apply(role, github_user)  │
│  • revoke()         │         │  • check_qualified()         │
└─────────────────────┘         └──────────────────────────────┘
         ▲                                   ▲
         │                                   │
    On-chain role access              AI validators render
    for DAO contributors              GitHub profiles + score
```

## Key differentiators (vs other repos)

- **Profile rendering** — validators use `web.render` to get full GitHub profile data
- **Weighted scoring** — configurable GitHub vs LinkedIn weight per role
- **Strengths + gaps analysis** — not just pass/fail, detailed breakdown
- **HireGate** — EVM access control (not escrow/vault pattern)
- **Astro frontend** — static-first, not Next.js or SvelteKit
- **No token needed** — this is access control, not financial

## Deployed

- **GenLayer (Bradbury):** `0xDEB4ED1CDF411354eDAe892f76d8B667b92e7760`

## Structure

- `genlayer/` — Intelligent contract: role creation, application with GitHub fetch, AI scoring
- `contracts/` — EVM: `HireGate` (role-based access control gated by credential verdict)
- `packages/sdk/` — TypeScript: `validateRequirements()`, `estimateDifficulty()`, `parseRequirements()`, `matchPercentage()`
- `web/` — Astro + Tailwind static UI (Define Role / Apply columns)

## Quick start

```bash
pnpm install
cd contracts && forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std
forge test -vv
cd ../web && pnpm dev
```

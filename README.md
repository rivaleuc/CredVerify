# CredVerify

**Trustless credential verification — résumés you cannot fake, scored on-chain by AI validators.**

CredVerify lets a DAO or org define a role in plain language, then lets a candidate apply with nothing but a GitHub handle. GenLayer validators independently fetch the public profile, judge it against the requirements, and reach consensus on a qualification verdict. The result is an on-chain credential that the `HireGate` EVM contract reads to grant or deny access — no HR middleman, no self-reported claims.

- **Contract (Bradbury, chain 4221):** `0xDEB4ED1CDF411354eDAe892f76d8B667b92e7760`
- **Explorer:** https://explorer-bradbury.genlayer.com/contract/0xDEB4ED1CDF411354eDAe892f76d8B667b92e7760
- **Live app:** https://credverify.pages.dev

## What it does

The lifecycle is **define → apply → verify → gate**:

1. **`create_role(title, requirements, github_weight, min_score)`** — an org writes the requirements in natural language (e.g. "3+ years Rust, contributed to open source"), sets how much the GitHub signal matters (`github_weight`, 0–100) and the passing bar (`min_score`, 0–100). Roles are stored as JSON in the `roles: TreeMap[str, str]` keyed by an incrementing `role_count`.
2. **`apply(role_key, github_username, linkedin_url, extra_notes)`** — a candidate applies. The contract calls the internal `_verify_credentials(...)` and stores the verdict in `applications: TreeMap[str, str]` under the key `"role:applicant"`. Role-level `applicants`/`verified` counters and the global `verified_count`/`rejected_count` are updated.
3. **Verification (the core).** Inside `_verify_credentials`, a `leader_fn` crawls the candidate's evidence with **`gl.nondet.web.render(f"https://github.com/{username}", mode="text")`** (and the LinkedIn URL if supplied), then asks an LLM to judge it with **`gl.nondet.exec_prompt(prompt, response_format="json")`**. The prompt forces strict, evidence-only scoring and a JSON reply: `{"score", "qualified", "strengths", "gaps", "reasoning"}`.
4. **Consensus.** The leader's output is finalized through **`gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`**. The `validator_fn` does not demand a byte-identical answer — it re-checks the leader's `gl.vm.Return.calldata` for *structural* validity: `score` is an int in 0–100, `qualified` is a bool, `reasoning` is a string. Validators that agree the verdict is well-formed accept it under Optimistic Democracy.
5. **Gating.** `check_qualified(role_key, applicant)` is the resolver the `HireGate` EVM contract reads to grant role-based access. `get_role`, `get_application`, and `stats` are read-only views.

## Why GenLayer

A deterministic EVM cannot run this. Solidity has no way to open `github.com`, read a profile, and form a *judgement* about whether someone is a "Senior Smart Contract Engineer" — there is no opcode for fetching untrusted web pages, and even if there were, two nodes fetching a live page at different moments would diverge and break consensus. CredVerify needs an LLM's reading comprehension applied to fuzzy, real-world evidence, with multiple independent nodes agreeing on the outcome.

GenLayer's **Optimistic Democracy** solves exactly that: a leader validator produces a verdict, other validators re-evaluate it, and as long as a supermajority agrees the result is *reasonable* (not identical), the transaction finalizes. Disagreements trigger appeals.

**Use GenLayer when** the truth lives off-chain, is subjective or natural-language, and you still need on-chain finality and an auditable record. **Use a plain backend when** the rule is a pure deterministic function of on-chain state (token balances, fixed math) — that belongs in Solidity, which is why `HireGate` stays on the EVM and only *reads* CredVerify's verdict.

## Architecture

| Intelligent contract (GenLayer) | Frontend dir | EVM / off-chain |
| --- | --- | --- |
| `genlayer/cred_verify.py` — `CredVerify(gl.Contract)`: `create_role`, `apply`, `check_qualified`, AI scoring via `run_nondet_unsafe` | `web/` (Vite + React + TS) | `contracts/HireGate.sol` — role-based access control gated by the on-chain verdict; web evidence (GitHub/LinkedIn) crawled off-chain by validators |

## Tech

**Contract** — GenVM Python, pinned to `py-genlayer:1jb45aa8…jpz09h6` via the `# { "Depends": ... }` header. State is held in `TreeMap[str, str]` stores (`roles`, `applications`) with `u256` counters. Non-deterministic work (`gl.nondet.web.render`, `gl.nondet.exec_prompt`) runs inside a `leader_fn`/`validator_fn` pair driven by `gl.vm.run_nondet_unsafe`.

**Frontend** — Vite + React 19 + TypeScript with Tailwind v4, `framer-motion`, and `sonner` toasts. `src/genlayer.ts` wraps `genlayer-js`: reads go through `createClient({ chain: testnetBradbury }).readContract`; writes connect MetaMask (`eth_requestAccounts`), switch the wallet to chain `0x107d` (4221) via `wallet_switchEthereumChain`/`wallet_addEthereumChain` (no GenLayer snap required), then `writeContract` and wait for a `FINALIZED` receipt. The UI is an indigo **Applicant Review Console**: a left role panel with animated skill-weight bars, a "Verify an Applicant" form that submits `apply` and flips a 3D qualification card (score, strengths, gaps, reasoning), and a verified-candidates roster. Live `stats`/`get_role` counts load on mount.

## Project structure

```
CredVerify/
├── genlayer/
│   └── cred_verify.py        # CredVerify(gl.Contract) — intelligent contract
├── contracts/
│   ├── src/HireGate.sol      # EVM role-based access control
│   └── test/HireGate.t.sol
├── packages/sdk/             # shared TS helpers
├── web/                      # frontend (Vite + React + TS)
│   ├── src/
│   │   ├── App.tsx           # Applicant Review Console
│   │   ├── genlayer.ts       # genlayer-js reads + MetaMask writes
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Develop

```bash
cd web
npm install
npm run dev      # local dev server
npm run build    # tsc -b && vite build → dist/
```

## Deploy the frontend

Deployed on **Cloudflare Pages**:

- **Root directory:** `web`
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment:** `NODE_VERSION=20`

## Why GenLayer (engineering notes)

- **No floats.** GenVM state uses integers — scores and weights are plain `int`/`u256` (0–100), never floating point. Use basis points / `u256` for anything finer.
- **Validate structure, not exact text.** `validator_fn` never compares the LLM's prose to the leader's prose. It only confirms the JSON is well-formed and in range. Demanding an exact match would make consensus impossible, since LLM output is non-deterministic.
- **ACCEPTED ≠ executed.** A finalized verdict means validators agreed the result was *reasonable*, not that any value was settled elsewhere. `HireGate` must read `check_qualified` itself to act.
- **Optimistic finality paces writes.** A write isn't trustworthy until it clears the appeal window — the frontend waits for a `FINALIZED` receipt (retries 60 × 5s), so applications can take 30–60s. Don't fire dependent writes before finality.
- **Evidence is untrusted / greybox.** A GitHub profile is attacker-controllable input. Profiles can be padded, forged, or unreachable; the prompt instructs the model to score on demonstrated evidence only and the code caps fetched text (`MAX_PROFILE_CHARS`). Treat every crawled page as hostile.

## License

MIT

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster, toast } from "sonner";
import { read, write, CONTRACT } from "./genlayer";

const ROLE_KEY = "0";
const APPLICANT = "0x4531c0303a368eeC4dc8ea165edC6F215aA3e2A9";

type Skill = { name: string; weight: number };

const ROLE = {
  title: "Senior Smart Contract Engineer",
  team: "Protocol Engineering",
  location: "Remote · Global",
  blurb:
    "We verify what candidates claim — on-chain. Credentials are scored against role requirements with zero trust in self-reported data.",
  skills: [
    { name: "Solidity", weight: 30 },
    { name: "TypeScript", weight: 20 },
    { name: "Security / Audits", weight: 25 },
    { name: "Open Source Footprint", weight: 15 },
    { name: "Systems Design", weight: 10 },
  ] as Skill[],
};

type Verdict = {
  handle: string;
  score: number;
  qualified: boolean;
  matched: string[];
  gaps: string[];
  reasoning: string;
};

type Candidate = {
  handle: string;
  score: number;
  status: "Qualified" | "Review" | "Below bar";
};

const ROSTER: Candidate[] = [
  { handle: "satoshulk", score: 94, status: "Qualified" },
  { handle: "0xMirena", score: 88, status: "Qualified" },
  { handle: " to-the-vm", score: 71, status: "Review" },
  { handle: "juniordev_99", score: 52, status: "Below bar" },
];

function scoreColor(s: number) {
  if (s >= 80) return "#16A34A";
  if (s >= 65) return "#CA8A04";
  return "#DC2626";
}

// Contract may return strengths/gaps as an array or a delimited string.
function toList(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(/[\n;,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

export default function App() {
  const [handle, setHandle] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [stats, setStats] = useState<{ total_roles: number; verified: number; rejected: number } | null>(null);
  const [roleInfo, setRoleInfo] = useState<{ applicants: number; verified: number } | null>(null);

  // Load real on-chain stats + role info on mount
  useEffect(() => {
    (async () => {
      try {
        const s: any = await read("stats");
        setStats({
          total_roles: Number(s?.total_roles ?? 0),
          verified: Number(s?.verified ?? 0),
          rejected: Number(s?.rejected ?? 0),
        });
      } catch (e: any) {
        toast.error("Could not load contract stats", { description: e?.message ?? String(e) });
      }
      try {
        const r: any = await read("get_role", [ROLE_KEY]);
        setRoleInfo({
          applicants: Number(r?.applicants ?? 0),
          verified: Number(r?.verified ?? 0),
        });
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const h = handle.trim().replace(/^@/, "");
    if (!h) {
      toast.error("Enter a GitHub handle to verify.");
      return;
    }
    if (verifying) return;
    setVerdict(null);
    setVerifying(true);
    toast.loading("Submitting application on-chain — this can take 30–60s…", { id: "verify" });

    try {
      await write("apply", [ROLE_KEY, h, "", ""]);
      const app: any = await read("get_application", [ROLE_KEY, APPLICANT]);
      const score = Number(app?.score ?? 0);
      const v: Verdict = {
        handle: String(app?.github_username || h),
        score,
        qualified: !!app?.qualified,
        matched: toList(app?.strengths),
        gaps: toList(app?.gaps),
        reasoning: String(app?.reasoning ?? ""),
      };
      setVerdict(v);

      // refresh on-chain counts
      try {
        const s: any = await read("stats");
        setStats({
          total_roles: Number(s?.total_roles ?? 0),
          verified: Number(s?.verified ?? 0),
          rejected: Number(s?.rejected ?? 0),
        });
        const r: any = await read("get_role", [ROLE_KEY]);
        setRoleInfo({ applicants: Number(r?.applicants ?? 0), verified: Number(r?.verified ?? 0) });
      } catch {
        /* non-fatal */
      }

      toast.success(`Verified @${v.handle} · score ${score}/100`, { id: "verify" });
    } catch (err: any) {
      toast.error("Verification failed", { id: "verify", description: err?.message ?? String(err) });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800">
      <Toaster richColors position="top-center" />

      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#4F46E5] text-white font-bold shadow-sm">
              C
            </div>
            <div className="leading-tight">
              <p className="font-semibold tracking-tight">CredVerify</p>
              <p className="text-xs text-slate-500">Applicant Review Console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {stats && (
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 md:flex">
                {stats.total_roles} roles · {stats.verified} verified · {stats.rejected} rejected
              </div>
            )}
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-mono text-slate-500 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {CONTRACT.slice(0, 10)}…{CONTRACT.slice(-6)}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          {/* LEFT: Role definition panel */}
          <motion.section
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-[#4F46E5]">
              Open Role
            </span>
            <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-900">
              {ROLE.title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {ROLE.team} · {ROLE.location}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              {ROLE.blurb}
            </p>

            {roleInfo && (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs font-mono text-slate-500">
                on-chain · {roleInfo.applicants} applicants · {roleInfo.verified} verified
              </p>
            )}

            <h2 className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Requirements &amp; Skill Weights
            </h2>
            <ul className="mt-3 space-y-3">
              {ROLE.skills.map((s) => (
                <li key={s.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{s.name}</span>
                    <span className="font-mono text-xs text-slate-400">
                      {s.weight}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${s.weight * 3}%` }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                      className="h-full rounded-full bg-[#4F46E5]"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </motion.section>

          {/* RIGHT: Applicant card + verify */}
          <section className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-sm font-semibold text-slate-700">
                Verify an Applicant
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Enter a GitHub handle. Credentials are attested on-chain and
                scored against the role above.
              </p>
              <form onSubmit={verify} className="mt-4 flex flex-col gap-3 sm:flex-row">
                <div className="flex flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-[#4F46E5] focus-within:bg-white">
                  <span className="text-slate-400">@</span>
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="github-handle"
                    disabled={verifying}
                    className="w-full bg-transparent px-2 py-3 text-sm outline-none placeholder:text-slate-400 disabled:opacity-60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={verifying}
                  className="rounded-xl bg-[#4F46E5] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {verifying ? "Verifying…" : "Run Verification"}
                </button>
              </form>
            </motion.div>

            {/* The flip card */}
            <div className="relative min-h-[280px]" style={{ perspective: 1200 }}>
              <AnimatePresence mode="wait">
                {verifying && (
                  <motion.div
                    key="scanning"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-indigo-200 bg-white"
                  >
                    <div className="text-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="mx-auto h-10 w-10 rounded-full border-2 border-indigo-200 border-t-[#4F46E5]"
                      />
                      <p className="mt-4 text-sm font-medium text-slate-600">
                        Resolving on-chain attestations…
                      </p>
                      <p className="text-xs text-slate-400">
                        Contract {CONTRACT.slice(0, 8)}…
                      </p>
                    </div>
                  </motion.div>
                )}

                {!verifying && verdict && (
                  <motion.div
                    key="result"
                    initial={{ rotateY: 90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    style={{ transformStyle: "preserve-3d" }}
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-bold text-white">
                          {verdict.handle.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            @{verdict.handle}
                          </p>
                          <p className="text-xs text-slate-500">
                            {verdict.qualified ? "Qualified" : "Below bar"} · {ROLE.title}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wider text-slate-400">
                          Qualification
                        </p>
                        <motion.p
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.25, type: "spring" }}
                          className="text-3xl font-extrabold"
                          style={{ color: scoreColor(verdict.score) }}
                        >
                          {verdict.score}
                          <span className="text-base text-slate-400">/100</span>
                        </motion.p>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                          Strengths
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {verdict.matched.length === 0 && (
                            <span className="text-xs text-slate-400">None reported.</span>
                          )}
                          {verdict.matched.map((m) => (
                            <span
                              key={m}
                              className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100"
                            >
                              ✓ {m}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">
                          Gaps
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {verdict.gaps.length === 0 && (
                            <span className="text-xs text-slate-400">
                              No material gaps.
                            </span>
                          )}
                          {verdict.gaps.map((g) => (
                            <span
                              key={g}
                              className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-100"
                            >
                              ✕ {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {verdict.reasoning && (
                      <div className="mt-5 border-t border-slate-100 pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Assessment
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                          {verdict.reasoning}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}

                {!verifying && !verdict && (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/60 text-center"
                  >
                    <div>
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
                        ⌕
                      </div>
                      <p className="mt-3 text-sm font-medium text-slate-500">
                        No applicant loaded
                      </p>
                      <p className="text-xs text-slate-400">
                        Run a verification to reveal the qualification card.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>

        {/* Roster */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-700">
              Verified Candidates
            </h2>
            <span className="text-xs text-slate-400">{ROSTER.length} on-chain</span>
          </div>
          <div className="divide-y divide-slate-100">
            {ROSTER.map((c, i) => (
              <motion.div
                key={c.handle}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.06 }}
                className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {c.handle.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-700">
                    @{c.handle}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className="text-sm font-bold"
                    style={{ color: scoreColor(c.score) }}
                  >
                    {c.score}
                  </span>
                  <span
                    className={
                      "rounded-full px-2.5 py-1 text-xs font-medium " +
                      (c.status === "Qualified"
                        ? "bg-emerald-50 text-emerald-700"
                        : c.status === "Review"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700")
                    }
                  >
                    {c.status}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <footer className="mt-8 text-center text-xs text-slate-400">
          CredVerify · Trustless credential verification · Contract{" "}
          <span className="font-mono">{CONTRACT}</span>
        </footer>
      </main>
    </div>
  );
}

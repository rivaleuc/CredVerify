# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
from genlayer import *

MAX_PROFILE_CHARS = 5000


# ----------------------------------------------------------------------
# Pure deterministic helpers (no LLM / no I/O) — unit-testable and shared by
# leader (derive) and validators (recompute). The qualification invariant is
# anchored to the role's min_score, never to free-form LLM text.
# ----------------------------------------------------------------------

def _coerce_int(value, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def normalize_cred_verdict(data: dict, min_score: int) -> dict:
    """Clamp score to [0,100] and DERIVE qualified == (score >= min_score)."""
    score = max(0, min(100, _coerce_int(data.get("score"), 0)))
    reasoning = str(data.get("reasoning") or "").strip() or "no reasoning provided"
    return {
        "score": score,
        "qualified": bool(score >= min_score),
        "strengths": str(data.get("strengths") or "").strip() or "none noted",
        "gaps": str(data.get("gaps") or "").strip() or "none noted",
        "reasoning": reasoning,
    }


def validate_cred_verdict(data: dict, min_score: int) -> bool:
    """Deterministic anchor: score range + qualified == (score >= min_score)
    + non-empty reasoning."""
    score = data.get("score")
    if not isinstance(score, int) or isinstance(score, bool):
        return False
    if score < 0 or score > 100:
        return False
    qualified = data.get("qualified")
    if not isinstance(qualified, bool):
        return False
    if qualified != (score >= min_score):
        return False
    reasoning = data.get("reasoning")
    if not isinstance(reasoning, str) or not reasoning.strip():
        return False
    return True


class CredVerify(gl.Contract):
    owner: str
    roles: TreeMap[str, str]          # role_key -> JSON role definition
    applications: TreeMap[str, str]   # "role:applicant" -> JSON verdict
    role_count: u256
    verified_count: u256
    rejected_count: u256

    def __init__(self):
        self.owner = str(gl.message.sender_address)
        self.role_count = u256(0)
        self.verified_count = u256(0)
        self.rejected_count = u256(0)

    # ------------------------------------------------------------------
    # Role management (DAO/org defines what they need)
    # ------------------------------------------------------------------

    @gl.public.write
    def create_role(self, title: str, requirements: str, github_weight: int, min_score: int) -> str:
        """
        Define a role with requirements.
        requirements: natural language (e.g. "3+ years Rust, contributed to open source")
        github_weight: 0-100, how much GitHub profile matters vs other signals
        min_score: 0-100, minimum to pass
        """
        title = str(title).strip()
        requirements = str(requirements).strip()
        if not title or not requirements:
            raise Exception("title and requirements required")

        key = str(int(self.role_count))
        role = {
            "creator": str(gl.message.sender_address),
            "title": title,
            "requirements": requirements[:2000],
            "github_weight": max(0, min(100, int(github_weight))),
            "min_score": max(0, min(100, int(min_score))),
            "applicants": 0,
            "verified": 0,
        }
        self.roles[key] = json.dumps(role)
        self.role_count += u256(1)
        return key

    # ------------------------------------------------------------------
    # Application: candidate submits their profile for verification
    # ------------------------------------------------------------------

    @gl.public.write
    def apply(self, role_key: str, github_username: str, linkedin_url: str, extra_notes: str) -> str:
        """
        Apply for a role. AI validators fetch your GitHub profile and
        judge if you meet the requirements.
        """
        role_key = str(role_key)
        if role_key not in self.roles:
            raise Exception("unknown role")
        role = json.loads(self.roles[role_key])

        github_username = str(github_username).strip()
        if not github_username:
            raise Exception("github_username required")

        applicant = str(gl.message.sender_address)
        app_key = f"{role_key}:{applicant}"

        # Run verification
        verdict = self._verify_credentials(role, github_username, linkedin_url, extra_notes)

        application = {
            "applicant": applicant,
            "github_username": github_username,
            "linkedin_url": str(linkedin_url).strip() if linkedin_url else "",
            "role_key": role_key,
            "score": verdict["score"],
            "qualified": verdict["qualified"],
            "strengths": verdict["strengths"],
            "gaps": verdict["gaps"],
            "reasoning": verdict["reasoning"],
        }
        self.applications[app_key] = json.dumps(application)

        # Update role stats
        role["applicants"] = role.get("applicants", 0) + 1
        if verdict["qualified"]:
            role["verified"] = role.get("verified", 0) + 1
            self.verified_count += u256(1)
        else:
            self.rejected_count += u256(1)
        self.roles[role_key] = json.dumps(role)

        return app_key

    # ------------------------------------------------------------------
    # AI verification (the core)
    # ------------------------------------------------------------------

    def _verify_credentials(self, role: dict, github_username: str, linkedin_url: str, extra_notes: str) -> dict:
        requirements = role["requirements"]
        github_weight = role["github_weight"]
        min_score = role["min_score"]
        role_title = role["title"]

        def leader_fn() -> str:
            # Fetch GitHub profile
            github_data = "(GitHub fetch failed)"
            try:
                profile_url = f"https://github.com/{github_username}"
                raw = gl.nondet.web.render(profile_url, mode="text")
                github_data = raw[:MAX_PROFILE_CHARS]
            except Exception:
                pass

            # Fetch LinkedIn if provided
            linkedin_data = ""
            if linkedin_url and str(linkedin_url).startswith("http"):
                try:
                    raw = gl.nondet.web.render(str(linkedin_url), mode="text")
                    linkedin_data = raw[:2000]
                except Exception:
                    linkedin_data = "(LinkedIn fetch failed)"

            prompt = f"""You are a credential verification engine for decentralized hiring.

ROLE: {role_title}
REQUIREMENTS:
{requirements}

GITHUB PROFILE DATA ({github_weight}% weight):
{github_data}

LINKEDIN DATA ({100 - github_weight}% weight):
{linkedin_data if linkedin_data else "(not provided)"}

CANDIDATE NOTES:
{extra_notes[:500] if extra_notes else "(none)"}

EVALUATION RULES:
1. Score the candidate 0-100 based on how well they match the requirements.
2. GitHub weight is {github_weight}% — look at repos, languages, contributions, activity.
3. Minimum passing score is {min_score}.
4. Be fair but strict. Real evidence only — don't infer skills not demonstrated.
5. List specific strengths and gaps.

Reply ONLY valid JSON:
{{"score": <0-100>, "qualified": true/false, "strengths": "<what they have>", "gaps": "<what's missing>", "reasoning": "<brief summary>"}}
No markdown, no code fences."""

            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            data = raw if isinstance(raw, dict) else json.loads(str(raw).strip())
            # Derive qualified from score vs min_score so honest leaders pass.
            return json.dumps(normalize_cred_verdict(data, min_score))

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                data = json.loads(leader_result.calldata)
                return validate_cred_verdict(data, min_score)
            except Exception:
                return False

        result_str = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        return json.loads(result_str)

    # ------------------------------------------------------------------
    # Views
    # ------------------------------------------------------------------

    @gl.public.view
    def get_role(self, key: str) -> dict:
        key = str(key)
        if key not in self.roles:
            return {"exists": False}
        return json.loads(self.roles[key])

    @gl.public.view
    def get_application(self, role_key: str, applicant: str) -> dict:
        app_key = f"{str(role_key)}:{str(applicant)}"
        if app_key not in self.applications:
            return {"exists": False}
        return json.loads(self.applications[app_key])

    @gl.public.view
    def check_qualified(self, role_key: str, applicant: str) -> dict:
        """HireGate resolver reads this to grant/deny access."""
        app_key = f"{str(role_key)}:{str(applicant)}"
        if app_key not in self.applications:
            return {"verified": False, "qualified": False}
        app = json.loads(self.applications[app_key])
        return {
            "verified": True,
            "qualified": app["qualified"],
            "score": app["score"],
            "applicant": app["applicant"],
        }

    @gl.public.view
    def stats(self) -> dict:
        return {
            "total_roles": int(self.role_count),
            "verified": int(self.verified_count),
            "rejected": int(self.rejected_count),
        }

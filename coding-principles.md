# Coding Principles — Detailed Guide (거래명세서 정리 도구)

> Expanded form of the compressed 4-principle summary in `CLAUDE.md`.
> **Load on demand when a coding decision is unclear — NOT read every call.**
> (This is the whole point of splitting it out: keep `CLAUDE.md` lean, keep per-call token cost down.)
> Scope: single developer, single app. **No agents.**

## 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.

Self-check: "Would a senior engineer call this overcomplicated?" If yes, simplify.

## 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Remove imports/variables your change orphaned. Don't delete pre-existing dead code unless asked.

The test: every changed line should trace directly to the request.

## 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

---

## Project-Specific Application (거래명세서 tool)

### P0 — Never Allowed
1. **Money-logic integrity.** If a payment-date or amount test fails, the bug is in the code — **never edit the expected value to make it green.** If the *spec itself* looks wrong (the expected date math should change), stop and ask. A plausible-looking wrong fix silently corrupts every payment date. (Goal-driven + correctness)
2. **No speculative generalization.** Manual entry is the product; the Excel importer is **deferred/optional, not core** — don't build it now. If/when it ships, it is **one hardcoded company format** — no format auto-detection, no column-mapping config, no multi-company abstraction "just in case." Same rule for the app itself: build the CRUD that's asked for, not a configurable engine. (Simplicity)
3. **No scope sprawl.** Asked for vendor CRUD → don't also add CSV import, bulk Excel, currency conversion, or report export unless asked. (If the importer is ever built: the one known layout only — no other formats.) (Surgical + Simplicity)
4. **No "it works" without verifying core paths.** Not done until these have passing tests against known inputs: payment-date calc (per terms rule), **amount calc (supplyAmount-primary: works with quantity/unitPrice blank; vat=0 when 면세 else round(supplyAmount×rate); total=supplyAmount+vat; rounding boundary e.g. 12,345→1,235)**, vendor grouping key (after trimming name), **category CRUD + in-use-delete guard (deleting a category still referenced by items is blocked, not a silent recategorize)**, **list sort/filter correctness (amount/quantity sort numerically, dates sort as dates — not lexicographic)**, transaction/item/vendor/category create·edit·delete. *(Excel-import tests only if/when the importer is built.)* (Goal-driven)
5. **Repository boundary — no bypass.** All DB access goes through `repository/`. UI, domain, and parser must **never call SQLite (or any DB driver) directly.** This one seam is what bounds a future multi-user (server+DB) migration — a stray query in a UI component breaks it silently, and you won't find out until migration day. "Just query here real quick, it's faster" **is** the violation → add/extend a repository function instead. **Limit (ties to #2):** the repository is the *only* sanctioned data-access layer. Do NOT stack further "future-proofing" on top (service layer, auth wrapper, generic adapter). One seam, not a framework. (Surgical + Simplicity)
6. **Data durability — an update must never corrupt the user's DB.** Data lives in one local SQLite file under `%APPDATA%` with **no server backup**; a bad migration or write = total, unrecoverable loss. Rules: (a) **versioned schema** — track the version (`PRAGMA user_version` or a meta row); on startup read it and migrate forward, never assume a fresh DB. (b) **back up before migrating** — copy the DB file (timestamped) first; it is the only safety net a local app has. (c) **forward-only, additive, transactional** — run each migration inside a transaction (crash mid-migrate → roll back, keep the old DB); add columns/tables, don't DROP or rename to "tidy up." (d) **money as integers** — store amounts as integer 원, never JS floats (float drift silently corrupts totals). **Scope guard (ties to #2):** the *rule* is pinned now, but do NOT build a migration framework before the first real schema change ships — when it does, write the smallest migration that satisfies (a)–(c), not a generic engine. (correctness + durability)

### Domain calc rules (locked from real Excel — `domain/`, not `parser/`)
These came out of the 3 real files and are now app rules regardless of whether import is ever built:
- **공급가액(`supplyAmount`) is the source of truth.** `quantity`/`unitPrice` are optional helpers — if both numeric, default supplyAmount = quantity×unitPrice (user-overridable), else entered directly. Real data: ~half the rows have only a lump-sum amount, or a non-numeric quantity ("2박스"). Never make qty/price required.
- `vat` = `taxType==='면세' ? 0 : Math.round(supplyAmount * taxRate)`, `taxRate = 0.10` (editable param). Excel ROUND = half-up; amounts positive so `Math.round` matches.
- `total` = `supplyAmount + vat`.
- **Normalize on input/import:** trim vendor names (trailing spaces seen), collapse a whitespace-only `taxType` to a real value (a blank-looking 과세구분 was silently taxed in Excel).
- **Category is a managed entity (CRUD), not a free-text field.** Items reference it by `categoryId` (nullable = uncategorized). Renaming hits `Category.name` once. Deleting an in-use category is **blocked by default** (reassign first) — never silently null-out items. Seed list is extensible; real data has names outside it (부재료/부자재/원재료), so on import auto-create unseen names rather than reject.
- `paymentStatus` (미지급/지급예정/지급완료) is a manual field, separate from computed `dueDate`.

### Recommended Patterns
- Before a new feature: write 1–2 lines of success criteria first.
- Ambiguous request: present 2–3 assumptions for selection — don't guess.
- Large refactor urge: propose as a separate task, don't fold it in.

### Tradeoff
- These bias toward caution over speed. Use judgment on trivial work.
- If the user says "quick and dirty," honor that intent — but keep P0 (money integrity, core-path tests) non-negotiable.

---

## Language Policy (kept minimal — solo tool, one Korean company)

> The unified-messenger bilingual-comment matrix is **intentionally NOT copied here.** Writing every comment in Korean *and* English doubles comment cost — including AI token cost on every generation, the exact thing the file-split is meant to cut. You are the only reader, and you're Korean-native. The English half buys nothing.

- Code identifiers, file/branch names, commits → **English** (ecosystem standard)
- Comments, `TODO` / `FIXME` → **Korean only**
- Log / debug messages → **English** (grep) — or Korean; pick one, stay consistent
- User-facing UI strings → **Korean only.** No i18n fallback layer — one Korean-speaking company, so i18n infra is YAGNI. Hardcode Korean.

> Want the full Korean+English bilingual comment ceremony anyway? Say so and it goes back.

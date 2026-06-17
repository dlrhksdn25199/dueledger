# Transaction Statement Management Tool — {CompanyName}

> Single Company · **Single-user Locally Installed Desktop App.** No server, no accounts.
> Execution = Single Claude Code session + Slash commands. No agentic layers.
> Immutable policies only. Detailed implementation guidelines are in the companion file (load when needed). Track progress via `docs/PROGRESS.md`.

## Purpose
An internal tool for managing and entering transaction statements. The core engine comprises two main parts: **automatic calculation of payment due dates** + **flexible CRUD operations for vendors, statements, and line items.**
Users can create, read, update, delete, and persist vendors, statements, and line items at any time, with features for grouping by vendor, calculating totals, and flagging upcoming payments.

Input System = **Manual entry is the primary flow.** (Batch Excel import is non-core — see decisions below.)

## Scope Boundary
**In-Scope** — Manual data entry · CRUD for Vendors/Statements/Line Items · **CRUD for Category Management List** · Payment due date calculation & alerts · Vendor-based grouping & summation · **Table View (Sorting, Filtering, Searching)**

**Out-of-Scope (Current Phase — Do Not Build)**
- Authentication, accounts, multi-user, or server architecture → Single-user local setup only.
- Concurrency locks or audit logs → Unnecessary as there is only 1 user.
- Tax invoices or accounting journals → E-Count / Douzone territory.
- Multi-company (multi-tenant) capability · Bank API integration · Actual payment processing.
- **Batch Excel Import → Non-core feature.** An optional capability for legacy data migration, to be implemented only when explicitly requested later (Not a P0 priority).

## ✅ Decisions Made
- **Distribution = Portable Electron `.exe`** (Single Windows user, one-click launch via double-click, no installation wizard). Direct SQLite connection via `better-sqlite3`.
  - Delivered to a single user. Code signing is skipped → Windows will display an "Unknown Publisher" warning on first launch; user proceeds via "More Info → Run Anyway" once (include in hand-off notes).
  - Updates = Provide a new `.exe` file → User replaces the old `.exe`. No auto-update engine.
- **🗄️ Data Storage Path = Fixed to `app.getPath('userData')` (%APPDATA%). Storing data next to the `.exe` is strictly prohibited** — ensures data persistence during executable migration or replacement. (P0)
- **🛡️ Data Invariants: Updates must never break the database.** Track schema versions · Back up DB prior to migration · Transactions must be forward-moving and additive · Store currency as integers (KRW). Enforcement details are in coding-principles **P0 #6**. ⚠️ *Define the rule now — do not pre-engineer the migration engine before the first schema alteration occurs (YAGNI).*
- No servers, authentication, or multi-user frameworks (YAGNI).
- **Excel File = Source for reverse-engineering calculations (Role fulfilled).** Mathematical formulas for amounts, tax, and rounding have been extracted from 3 production files and codified inside `domain`. Parameters like tax rates remain editable data points. Payment terms do not exist in the Excel sheets and are a new attribute introduced by this app.
  - **Excel Importer is non-core → Optional / Deferred** (intended solely for legacy data migration). When built, it must support exactly 1 corporate template; auto-detection or multi-company mappings are forbidden.
- **Architecture = Single Session.** Multi-agent architectures are prohibited.
- **🔑 Single Repository Layer (Mandatory).** All data access must pass exclusively through `repository/`. Direct SQLite invocations from `ui/`, `domain/`, or `parser/` are **strictly forbidden.**
  - Rationale: Isolates the modification scope within a single layer if a future migration to a multi-user environment (Server + DB) is required.
  - ⚠️ Do not introduce service layers, authentication wrappers, or generic adapters "for future use" outside this single boundary. It is a thin isolation layer, not an enterprise framework.

## Data Model (1 Statement to N Line Items)
```
Vendor          : { id, name, paymentTerms }
Category        : { id, name }                                                        // Management list (CRUD)
Transaction     : { id, vendorId, issueDate, dueDate, paymentStatus, memo }          // Statement Header
TransactionItem : { id, transactionId, categoryId?, name, spec,
                    quantity?, unitPrice?, supplyAmount, taxType, vat, total }        // Line Item
```
**Monetary Calculus Rules (Reverse-engineered from production Excel sheets — Dependency chain: Quantity × Unit Price → (Optional) → Supply Amount → VAT → Total):**
- **`supplyAmount` represents the single source of truth for financial input. `quantity` and `unitPrice` are nullable supporting metrics.**
  If both quantity and unit price are numeric, `supplyAmount` defaults to `quantity × unitPrice` (overridable); otherwise, it is captured via direct manual entry.
  ⚠️ Do not make quantity and unit price mandatory fields — half of the legacy datasets contain only total amounts, or specify quantities as text (e.g., "2 boxes").
- `vat` = `taxType === 'Tax-Free' ? 0 : round(supplyAmount × taxRate)` · Where `taxRate = 0.10` (editable parameter).
  Rounding rule = Round half up to the nearest integer. Since financial inputs are strictly positive, this aligns with `Math.round`.
- `total` = `supplyAmount + vat` · Statement Grand Total = Σ Item total.

**Category = Management List (An independent entity, identical to Vendors):**
- Supports full CRUD operations: Add, Rename, Delete. Line items reference categories via `categoryId` (unclassified items allowed → nullable).
- Renaming = Modify `Category.name` in a single record; all referencing items update dynamically via the Foreign Key constraint.
- **Deletion Policy for Active Categories: Block by default.** If a category is bound to any line item, deny deletion, output the active reference count, and prompt the user to reassign items before deleting. (Alternative: Cascade to null silently, but this is non-standard behavior).
- Initial Seed Data: Food Ingredients / Packaging / Consumables / Sanitation / Miscellaneous. Legacy data includes sub-materials, auxiliary assets, and raw materials; **users may add categories freely.** If an importer is eventually introduced, unrecognized categories must be created automatically rather than throwing errors.

**Static Enums (Modifications happen via code updates; not exposed as a user CRUD UI):**
- `taxType`: Taxable / Tax-Free (Standard South Korean 2-value VAT structure).
- `paymentStatus`: Unpaid / Payment Scheduled / Paid.
- Users can assign and alter statuses freely per record. If states like "Partially Paid" are required later, they will be appended directly to the enum array.

- Every interaction with Vendors, Categories, Statements, and Line Items must pass through the repository layer (P0 #5).

## Payment Due Date Calculation Rules (Vendor-specific configuration data; not derived from external APIs)
- `paymentTerms: { type: "net" | "dayOfMonth", value }`
  - `net` → `issueDate` + value days (e.g., Net-30).
  - `dayOfMonth` → Day [value] of every subsequent month.
- Users configure and update these criteria per vendor within the application. Additional calculation archetypes will be added only if these two prove insufficient.
- **`dueDate` = Computed timestamp generated by applying `paymentTerms` to the statement's `issueDate` (Calculated once per statement header).**
  This derived attribute does not exist in the legacy Excel spreadsheets and serves as a core value proposition of this application.
- **`paymentStatus` (Unpaid / Payment Scheduled / Paid) functions independently — a manual checkbox indicating execution state.** It coexists alongside the `dueDate`. Because payment fulfillment occurs per statement, this attribute resides in the header.

## Tables: Sorting, Filtering, and Searching
The primary screen displays a **Flat Row View**, combining line items (`TransactionItem`) with header contexts (`Transaction` attributes: Issue Date, Vendor Name, Payment Status) via SQL joins. All interactions must target the repository layer (Raw SQL in UI components is ❌).
- **Sorting**: Supported across Issue Date, Vendor, Category, Supply Amount, Total, Payment Status, and Due Date columns. ⚠️ Financial metrics and quantities must utilize **numerical sorting** (natural sorting applies as values are stored as integers); date parameters must use **chronological date sorting** — eliminate string-sorting alphabetical bugs (verify via targeted tests).
- **Filtering**: Segment by Vendor · Category · Payment Status · Tax Type · Month (`YYYY-MM`) · Due Date Range.
- **Searching**: Partial matching via `LIKE` syntax across Item Name, Vendor Name, and Memo fields. Strip trailing/leading spaces via `trim()` on vendor lookups.
- Scope Guardrails: Constrain implementation strictly to native column sorting, the predefined filters, and simple `LIKE` clauses. **Do not develop a Query DSL, full-text search indexes, or dynamic runtime column query builders** (P0 #2).

---

1. ~~Excel Sheet Template Analysis~~ — **Completed. Formulas and column mappings successfully extracted** → `domain` definitions finalized (see structural monetization rules above). Importer postponed as a non-core feature.
2. Verify if `paymentTerms` types (`net` and `dayOfMonth`) capture all corporate workflows — to be continually evaluated against active vendor contracts.

## Technology Stack (Local Desktop)
- Frontend: React
- Desktop Container: Electron (Recommended) / Tauri
- Excel Parser: SheetJS (`xlsx`)
- Database Engine: Local SQLite File
- Enterprise Infrastructure: Server instances, Postgres, and external Authentication libraries are **absent**.

## 🔄 Workflow / Session Automation
| Trigger | Action |
|---|---|
| `Start` / `Resume` | Execute `git pull` → Read `docs/PROGRESS.md` → Deliver status briefing in Korean. |
| `Conclude` / `End` | Update `docs/PROGRESS.md` → Execute `git add/commit` (English, Conventional Commits) → Execute `git push` → Deliver termination briefing. |
| Operational Invariant | Explicitly ban git state changes during active mid-session task execution. |

Targeted Execution Entry Points (Optional): `/build-domain` · `/build-ui` · *(`/build-parser` is reserved strictly for subsequent importer creation)*

## 📎 Companion Files (Load on demand)
- `coding-principles.md` — Granular breakdown of the 4 Core Coding Principles + 6 Project P0 Mandates + Language Isolation Strategy.
- `loop.md` — CI Automation Watchdog Configuration (Optional, runner assignment pending).

## 🧭 The 4 Core Coding Principles (Summary — See `coding-principles.md`)
1. **Think first** — Explicitly state assumptions; ask clarifying questions when encountering ambiguity.
2. **Simplicity** — Build precisely what was requested; do not over-engineer.
3. **Surgical** — Mutate only the specific lines of code directly linked to the current objective.
4. **Goal-driven** — Write verifiable success criteria before starting implementation.

## 🌐 Language Isolation Strategy (Summary — See `coding-principles.md`)
- Machine Tokens: Identifiers, filenames, and commit messages must be written in **English**.
- Development Context: Inline codebase code comments and `TODO`/`FIXME` markers must be written in **Korean**.
- User Interface: Visual application strings must use **Korean** (no localization/i18n layer abstraction).

## Directory Schema
```
src/
  domain/      # Calculation logic, VAT calculation rules, grouping algorithms (DB calls ❌) — Holds core domain constraints independently of the importer status.
  repository/  # Unitary gateway for database access — SQLite interaction is restricted exclusively to this layer.
  ui/          # React presentation layer (invokes repository interfaces; direct SQLite usage ❌).
  parser/      # (Optional/Deferred) Excel binary to relational data migration mapping. Layout: Col B (Issue Date), D (Vendor), E (Category), F (Item Name), G (Specification), H (Quantity), I (Unit Price), J (Supply Amount), K (Tax Type), N (Payment Status), O (Memo).
data/          # SQLite database storage directory.
samples/       # (Optional) Production corporate Excel sheet examples — utilized exclusively during importer development.
docs/          # Operational records, including PROGRESS.md.
```

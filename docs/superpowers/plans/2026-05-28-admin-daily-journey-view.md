# Admin Daily Journey View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first admin visual report: a daily journey view grouped by collaborator, showing what was already punched, what is still missing, and which records need attention.

**Architecture:** Keep the existing detailed punch mirror as the audit table. Add a focused pure JavaScript journey helper for grouping and status calculation, then render a new visual daily journey section above the existing table in the "Espelho de Ponto" tab. The helper must work both in the browser and in Node tests.

**Tech Stack:** Node.js 20+, built-in `node:test`, vanilla HTML/CSS/JavaScript, existing `server.js` JSON API and current `public/app.js` patterns.

---

## Source Spec

Use this spec as the product reference:

- `docs/superpowers/specs/2026-05-28-admin-reports-accounting-design.md`

This plan implements only Fase 1: Jornada Visual Diaria. It does not implement collaborator profiles, class schedules, accounting exports, Onvio automation, or the collaborator-facing journey panel.

## File Structure

- Create `public/journey.js`: pure journey grouping and status helpers. Exports through `module.exports` for Node tests and `window.RenovaJourney` for browser use.
- Create `tests/journey.test.js`: unit tests for grouping, state calculation, rejected/manual flags, and filtering.
- Modify `package.json`: add `test` script using Node's built-in test runner.
- Modify `public/index.html`: include `journey.js` before `app.js`; add daily journey controls and cards container above the existing table.
- Modify `public/app.js`: wire DOM elements, default date, rendering, filter/date events, and refresh behavior.
- Modify `public/styles.css`: add compact visual card/timeline styles for desktop and mobile.

## Data Model For The View

The journey helper should transform punch events into summaries shaped like:

```js
{
  userId: "user-id",
  userName: "Gabrielle Deodato",
  userCode: "Gabrielle",
  dateKey: "28/05/2026",
  firstIn: punchOrNull,
  lastIntervalIn: punchOrNull,
  lastIntervalOut: punchOrNull,
  lastOut: punchOrNull,
  lastApprovedType: "in",
  status: "open",
  statusLabel: "Em jornada",
  attention: ["Sem saida"],
  hasRejected: false,
  hasManual: false,
  hasEdited: false,
  approvedCount: 3,
  rejectedCount: 0,
  punches: [/* sorted punches for that user/date */]
}
```

Status values for Fase 1:

- `not_started`: no approved entry on the selected day.
- `open`: approved entry exists and the last approved event is `in` or `interval_out`.
- `interval_open`: last approved event is `interval_in`.
- `complete`: last approved event is `out`.
- `attention`: no normal operational state can be derived but there are records needing review.

Operational inconsistencies for Fase 1:

- `Sem entrada`
- `Sem saida`
- `Intervalo iniciado e nao finalizado`
- `Ponto recusado`
- `Registro manual`
- `Registro editado`

Do not treat duplicate event sequences or "saida antes de entrada" as normal operational inconsistencies. The app's button state machine prevents those in normal use; if discovered later, they belong in a separate technical audit view.

---

### Task 1: Add Journey Helper Unit Tests

**Files:**
- Create: `tests/journey.test.js`
- Test: `tests/journey.test.js`

- [ ] **Step 1: Create the test file with expected behavior**

Create `tests/journey.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDailyJourneys,
  getDateKey,
  getPunchTime,
  isManualPunch,
} = require("../public/journey.js");

function punch(overrides) {
  return {
    id: overrides.id || crypto.randomUUID(),
    userId: overrides.userId || "u1",
    userCode: overrides.userCode || "gabrielle",
    userName: overrides.userName || "Gabrielle",
    type: overrides.type || "in",
    status: overrides.status || "approved",
    reason: overrides.reason || null,
    distanceMeters: overrides.distanceMeters ?? 140,
    accuracy: overrides.accuracy ?? 15,
    createdAt: overrides.createdAt || "2026-05-28T10:00:00.000Z",
    originalCreatedAt: overrides.originalCreatedAt,
  };
}

test("getDateKey returns pt-BR date key", () => {
  assert.equal(getDateKey("2026-05-28T10:00:00.000Z"), "28/05/2026");
});

test("getPunchTime formats a punch time for display", () => {
  assert.match(getPunchTime(punch({ createdAt: "2026-05-28T10:05:00.000Z" })), /^\\d{2}:\\d{2}$/);
  assert.equal(getPunchTime(null), "-");
});

test("isManualPunch detects admin-created manual records", () => {
  assert.equal(isManualPunch(punch({ distanceMeters: 0, accuracy: 1, reason: "Registro manual por admin" })), true);
  assert.equal(isManualPunch(punch({ distanceMeters: 140, accuracy: 20, reason: null })), false);
});

test("buildDailyJourneys groups approved punches into a complete journey", () => {
  const result = buildDailyJourneys([
    punch({ type: "out", createdAt: "2026-05-28T20:00:00.000Z" }),
    punch({ type: "interval_in", createdAt: "2026-05-28T15:00:00.000Z" }),
    punch({ type: "interval_out", createdAt: "2026-05-28T16:00:00.000Z" }),
    punch({ type: "in", createdAt: "2026-05-28T11:00:00.000Z" }),
  ], { dateKey: "28/05/2026" });

  assert.equal(result.length, 1);
  assert.equal(result[0].status, "complete");
  assert.equal(result[0].statusLabel, "Completa");
  assert.equal(result[0].firstIn.type, "in");
  assert.equal(result[0].lastIntervalIn.type, "interval_in");
  assert.equal(result[0].lastIntervalOut.type, "interval_out");
  assert.equal(result[0].lastOut.type, "out");
  assert.deepEqual(result[0].attention, []);
});

test("buildDailyJourneys marks open journey without exit", () => {
  const result = buildDailyJourneys([
    punch({ type: "in", createdAt: "2026-05-28T11:00:00.000Z" }),
  ], { dateKey: "28/05/2026" });

  assert.equal(result[0].status, "open");
  assert.equal(result[0].statusLabel, "Em jornada");
  assert.deepEqual(result[0].attention, ["Sem saida"]);
});

test("buildDailyJourneys marks interval still open", () => {
  const result = buildDailyJourneys([
    punch({ type: "in", createdAt: "2026-05-28T11:00:00.000Z" }),
    punch({ type: "interval_in", createdAt: "2026-05-28T15:00:00.000Z" }),
  ], { dateKey: "28/05/2026" });

  assert.equal(result[0].status, "interval_open");
  assert.equal(result[0].statusLabel, "Intervalo aberto");
  assert.deepEqual(result[0].attention, ["Intervalo iniciado e nao finalizado"]);
});

test("buildDailyJourneys includes rejected, edited, and manual attention flags", () => {
  const result = buildDailyJourneys([
    punch({ type: "in", status: "approved", createdAt: "2026-05-28T11:00:00.000Z" }),
    punch({ type: "in", status: "rejected", reason: "Precisao insuficiente", createdAt: "2026-05-28T11:05:00.000Z" }),
    punch({ type: "out", status: "approved", reason: "Registro manual por admin", distanceMeters: 0, accuracy: 1, createdAt: "2026-05-28T20:00:00.000Z" }),
    punch({ type: "interval_in", status: "approved", originalCreatedAt: "2026-05-28T15:00:00.000Z", createdAt: "2026-05-28T15:10:00.000Z" }),
  ], { dateKey: "28/05/2026" });

  assert.equal(result[0].hasRejected, true);
  assert.equal(result[0].hasManual, true);
  assert.equal(result[0].hasEdited, true);
  assert.equal(result[0].attention.includes("Ponto recusado"), true);
  assert.equal(result[0].attention.includes("Registro manual"), true);
  assert.equal(result[0].attention.includes("Registro editado"), true);
});

test("buildDailyJourneys filters by collaborator search", () => {
  const result = buildDailyJourneys([
    punch({ userId: "u1", userName: "Gabrielle", userCode: "gab", type: "in" }),
    punch({ userId: "u2", userName: "Talita", userCode: "tal", type: "in" }),
  ], { dateKey: "28/05/2026", search: "tali" });

  assert.equal(result.length, 1);
  assert.equal(result[0].userName, "Talita");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test
```

Expected: FAIL because `package.json` has no `test` script and `public/journey.js` does not exist yet.

- [ ] **Step 3: Commit the failing tests only if the team accepts red commits**

Preferred for this repo: do not commit the failing test by itself. Continue to Task 2 and commit helper plus tests together.

---

### Task 2: Add Browser/Node Journey Helper

**Files:**
- Create: `public/journey.js`
- Modify: `package.json`
- Test: `tests/journey.test.js`

- [ ] **Step 1: Create `public/journey.js`**

Create `public/journey.js`:

```js
(function initJourneyHelpers(root) {
  const STATUS_LABELS = {
    not_started: "Sem entrada",
    open: "Em jornada",
    interval_open: "Intervalo aberto",
    complete: "Completa",
    attention: "Revisar",
  };

  function getDateKey(value) {
    return new Date(value).toLocaleDateString("pt-BR");
  }

  function getPunchTime(punch) {
    if (!punch) return "-";
    return new Date(punch.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function isManualPunch(punch) {
    return punch.status === "approved" && punch.distanceMeters === 0 && punch.accuracy === 1 && Boolean(punch.reason);
  }

  function addUnique(list, value) {
    if (!list.includes(value)) list.push(value);
  }

  function byCreatedAtAsc(a, b) {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  function matchesSearch(summary, search) {
    const term = String(search || "").trim().toLowerCase();
    if (!term) return true;
    return String(summary.userName || "").toLowerCase().includes(term) ||
      String(summary.userCode || "").toLowerCase().includes(term);
  }

  function summarizeUserDay(userId, punches, dateKey) {
    const sorted = punches.slice().sort(byCreatedAtAsc);
    const approved = sorted.filter((punch) => punch.status === "approved");
    const rejected = sorted.filter((punch) => punch.status === "rejected");
    const attention = [];
    const firstApproved = approved[0] || sorted[0] || {};
    const lastApproved = approved[approved.length - 1] || null;
    const firstIn = approved.find((punch) => punch.type === "in") || null;
    const intervalIns = approved.filter((punch) => punch.type === "interval_in");
    const intervalOuts = approved.filter((punch) => punch.type === "interval_out");
    const outs = approved.filter((punch) => punch.type === "out");
    const lastIntervalIn = intervalIns[intervalIns.length - 1] || null;
    const lastIntervalOut = intervalOuts[intervalOuts.length - 1] || null;
    const lastOut = outs[outs.length - 1] || null;
    const hasManual = sorted.some(isManualPunch);
    const hasEdited = sorted.some((punch) => Boolean(punch.originalCreatedAt));
    const hasRejected = rejected.length > 0;

    let status = "attention";
    if (!firstIn) {
      status = "not_started";
      addUnique(attention, "Sem entrada");
    } else if (lastApproved?.type === "out") {
      status = "complete";
    } else if (lastApproved?.type === "interval_in") {
      status = "interval_open";
      addUnique(attention, "Intervalo iniciado e nao finalizado");
    } else if (lastApproved?.type === "in" || lastApproved?.type === "interval_out") {
      status = "open";
      addUnique(attention, "Sem saida");
    }

    if (hasRejected) addUnique(attention, "Ponto recusado");
    if (hasManual) addUnique(attention, "Registro manual");
    if (hasEdited) addUnique(attention, "Registro editado");

    return {
      userId,
      userName: firstApproved.userName || "",
      userCode: firstApproved.userCode || "",
      dateKey,
      firstIn,
      lastIntervalIn,
      lastIntervalOut,
      lastOut,
      lastApprovedType: lastApproved?.type || null,
      status,
      statusLabel: STATUS_LABELS[status],
      attention,
      hasRejected,
      hasManual,
      hasEdited,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      punches: sorted,
    };
  }

  function buildDailyJourneys(punches, options = {}) {
    const dateKey = options.dateKey || getDateKey(new Date());
    const grouped = new Map();

    for (const punch of punches || []) {
      if (getDateKey(punch.createdAt) !== dateKey) continue;
      const key = punch.userId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(punch);
    }

    return Array.from(grouped.entries())
      .map(([userId, userPunches]) => summarizeUserDay(userId, userPunches, dateKey))
      .filter((summary) => matchesSearch(summary, options.search))
      .sort((a, b) => a.userName.localeCompare(b.userName, "pt-BR"));
  }

  const api = {
    buildDailyJourneys,
    getDateKey,
    getPunchTime,
    isManualPunch,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.RenovaJourney = api;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 2: Add the test script**

Modify `package.json`:

```json
{
  "name": "renova-ponto",
  "version": "0.1.0",
  "private": true,
  "description": "MVP interno de ponto eletrônico com geolocalização para a Escola Renova.",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js",
    "test": "node --test tests/*.test.js"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm test
```

Expected: PASS for all tests in `tests/journey.test.js`.

- [ ] **Step 4: Run syntax checks**

Run:

```bash
node --check public/journey.js
node --check public/app.js
node --check server.js
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json public/journey.js tests/journey.test.js
git commit -m "Add daily journey grouping helper"
```

---

### Task 3: Add Daily Journey Markup

**Files:**
- Modify: `public/index.html`
- Test: Browser smoke test in Task 6

- [ ] **Step 1: Include helper before app script**

In `public/index.html`, add `journey.js` before `app.js` near the bottom of the file:

```html
<script src="/journey.js"></script>
<script src="/app.js"></script>
```

- [ ] **Step 2: Add the daily journey section above the detailed table**

Inside `#tab-punches`, after the filters grid and before `.table-responsive`, add:

```html
<section class="journey-panel" aria-labelledby="journeyTitle">
  <div class="journey-panel-header">
    <div>
      <h3 id="journeyTitle">Jornada diária</h3>
      <p id="journeySummaryMeta" class="journey-summary-meta">Selecione uma data para ver as jornadas.</p>
    </div>
    <label class="journey-date-control" for="journeyDate">
      Data
      <input type="date" id="journeyDate">
    </label>
  </div>
  <div id="adminJourneyCards" class="journey-cards" aria-live="polite"></div>
</section>

<div class="audit-table-heading">
  <h3>Eventos detalhados</h3>
  <p>Lista cronológica para auditoria, edição e exclusão de registros.</p>
</div>
```

- [ ] **Step 3: Run an HTML sanity check**

Run:

```bash
rg -n "journeyDate|adminJourneyCards|journey.js|Eventos detalhados" public/index.html
```

Expected: all four markers appear.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "Add daily journey admin markup"
```

---

### Task 4: Wire Journey Rendering In `app.js`

**Files:**
- Modify: `public/app.js`
- Test: `npm test`, syntax checks, browser smoke test in Task 6

- [ ] **Step 1: Add DOM references**

In the `elements` object in `public/app.js`, add:

```js
journeyDate: document.querySelector("#journeyDate"),
journeySummaryMeta: document.querySelector("#journeySummaryMeta"),
adminJourneyCards: document.querySelector("#adminJourneyCards"),
```

- [ ] **Step 2: Add date helpers**

Near `matchesDateFilter`, add:

```js
function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInputToDateKey(value) {
  if (!value) return new Date().toLocaleDateString("pt-BR");
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}
```

- [ ] **Step 3: Add renderer**

Add this function after `renderAdminPunchesTable()`:

```js
function renderAdminJourneyView() {
  if (state.user?.role !== "admin" || !elements.adminJourneyCards || !window.RenovaJourney) return;

  if (!elements.journeyDate.value) {
    elements.journeyDate.value = toDateInputValue();
  }

  const dateKey = dateInputToDateKey(elements.journeyDate.value);
  const search = elements.filterSearch.value || "";
  const journeys = window.RenovaJourney.buildDailyJourneys(state.punches, { dateKey, search });
  const completeCount = journeys.filter((journey) => journey.status === "complete").length;
  const attentionCount = journeys.filter((journey) => journey.attention.length > 0).length;

  elements.journeySummaryMeta.textContent = `${journeys.length} colaboradores · ${completeCount} completas · ${attentionCount} com atenção`;

  if (!journeys.length) {
    elements.adminJourneyCards.innerHTML = '<p class="empty">Nenhuma jornada encontrada para a data e filtros selecionados.</p>';
    return;
  }

  elements.adminJourneyCards.innerHTML = journeys.map((journey) => {
    const steps = [
      ["Entrada", journey.firstIn],
      ["Intervalo", journey.lastIntervalIn],
      ["Retorno", journey.lastIntervalOut],
      ["Saída", journey.lastOut],
    ];
    const attention = journey.attention.length
      ? `<div class="journey-attention">${journey.attention.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
      : "";

    return `
      <article class="journey-card ${journey.status}">
        <div class="journey-card-top">
          <div>
            <strong>${escapeHtml(journey.userName)}</strong>
            <small>Código: ${escapeHtml(journey.userCode)}</small>
          </div>
          <span class="journey-status ${journey.status}">${escapeHtml(journey.statusLabel)}</span>
        </div>
        <div class="journey-timeline">
          ${steps.map(([label, punch]) => `
            <div class="journey-step ${punch ? "done" : "pending"}">
              <span>${label}</span>
              <strong>${window.RenovaJourney.getPunchTime(punch)}</strong>
            </div>
          `).join("")}
        </div>
        ${attention}
      </article>
    `;
  }).join("");
}
```

- [ ] **Step 4: Call the renderer after punch loads**

In `loadPunches()`, inside the admin branch, change:

```js
renderAdminSummary();
renderAdminPunchesTable();
renderAdminPersonalPunch();
```

to:

```js
renderAdminSummary();
renderAdminJourneyView();
renderAdminPunchesTable();
renderAdminPersonalPunch();
```

- [ ] **Step 5: Call the renderer when opening the punches tab**

In `switchTab(tabId)`, inside `tabId === "punches"`, change:

```js
loadPunches().catch((error) => console.error(error));
renderAdminPunchesTable();
```

to:

```js
if (elements.journeyDate && !elements.journeyDate.value) {
  elements.journeyDate.value = toDateInputValue();
}
loadPunches().catch((error) => console.error(error));
renderAdminJourneyView();
renderAdminPunchesTable();
```

- [ ] **Step 6: Re-render on filters and date changes**

Replace the current filter event listeners:

```js
elements.filterSearch.addEventListener("input", () => renderAdminPunchesTable());
elements.filterDate.addEventListener("change", () => renderAdminPunchesTable());
elements.filterType.addEventListener("change", () => renderAdminPunchesTable());
elements.filterStatus.addEventListener("change", () => renderAdminPunchesTable());
```

with:

```js
const renderAdminReports = () => {
  renderAdminJourneyView();
  renderAdminPunchesTable();
};

elements.filterSearch.addEventListener("input", renderAdminReports);
elements.filterDate.addEventListener("change", renderAdminReports);
elements.filterType.addEventListener("change", renderAdminReports);
elements.filterStatus.addEventListener("change", renderAdminReports);

if (elements.journeyDate) {
  elements.journeyDate.addEventListener("change", renderAdminReports);
}
```

- [ ] **Step 7: Run checks**

Run:

```bash
npm test
node --check public/app.js
node --check public/journey.js
node --check server.js
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add public/app.js
git commit -m "Render admin daily journey view"
```

---

### Task 5: Style The Daily Journey View

**Files:**
- Modify: `public/styles.css`
- Test: Browser visual smoke test in Task 6

- [ ] **Step 1: Add journey styles**

Add these styles near the existing admin table/filter styles:

```css
.journey-panel {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: 20px 0;
  margin-bottom: 24px;
}

.journey-panel-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 16px;
}

.journey-panel-header h3,
.audit-table-heading h3 {
  margin: 0;
  color: var(--brand-blue-dark);
  font-family: "Outfit", sans-serif;
  font-size: 20px;
}

.journey-summary-meta,
.audit-table-heading p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}

.journey-date-control {
  display: grid;
  gap: 6px;
  color: var(--brand-blue-dark);
  font-size: 13px;
  font-weight: 800;
}

.journey-date-control input {
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: var(--border-radius-sm);
  padding: 0 12px;
  font: inherit;
  background: var(--panel);
}

.journey-cards {
  display: grid;
  gap: 12px;
}

.journey-card {
  border: 1px solid var(--line);
  border-left: 5px solid var(--muted);
  border-radius: var(--border-radius-sm);
  background: rgba(255, 255, 255, 0.86);
  padding: 14px;
}

.journey-card.complete {
  border-left-color: var(--ok);
}

.journey-card.open,
.journey-card.interval_open {
  border-left-color: var(--brand-yellow);
}

.journey-card.attention,
.journey-card.not_started {
  border-left-color: var(--bad);
}

.journey-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.journey-card-top strong {
  display: block;
  color: var(--ink);
  font-size: 15px;
}

.journey-card-top small {
  display: block;
  color: var(--muted);
  font-weight: 700;
  margin-top: 3px;
}

.journey-status {
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  color: var(--brand-blue-dark);
  background: rgba(46, 91, 153, 0.08);
  white-space: nowrap;
}

.journey-status.complete {
  color: white;
  background: var(--ok);
}

.journey-status.open,
.journey-status.interval_open {
  background: var(--brand-yellow);
}

.journey-status.attention,
.journey-status.not_started {
  color: white;
  background: var(--bad);
}

.journey-timeline {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.journey-step {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  min-height: 64px;
  background: rgba(46, 91, 153, 0.03);
}

.journey-step.done {
  border-color: rgba(16, 185, 129, 0.28);
  background: rgba(16, 185, 129, 0.08);
}

.journey-step.pending {
  color: var(--muted);
}

.journey-step span {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
}

.journey-step strong {
  display: block;
  margin-top: 6px;
  font-size: 18px;
  color: var(--brand-blue-dark);
}

.journey-attention {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.journey-attention span {
  border-radius: 999px;
  padding: 5px 9px;
  background: rgba(239, 68, 68, 0.1);
  color: var(--bad);
  font-size: 12px;
  font-weight: 800;
}

.audit-table-heading {
  margin: 0 0 12px;
}

@media (max-width: 720px) {
  .journey-panel-header {
    align-items: stretch;
    flex-direction: column;
  }

  .journey-timeline {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 2: Run a color/theme sanity check**

Run:

```bash
rg -n "journey-|audit-table-heading|brand-yellow|--bad|--ok" public/styles.css
```

Expected: new journey selectors are present and use existing theme variables.

- [ ] **Step 3: Commit**

```bash
git add public/styles.css
git commit -m "Style admin daily journey cards"
```

---

### Task 6: Browser Verification

**Files:**
- No committed files required.
- Temporary verification scripts may be created under `output/playwright/` and removed before commit.

- [ ] **Step 1: Start local app**

Run:

```bash
$env:PORT='4010'; node server.js
```

Expected: server logs `Escola Renova Ponto rodando em http://localhost:4010`.

- [ ] **Step 2: Open browser and log in as admin**

Use Playwright or the browser plugin to:

1. Open `http://127.0.0.1:4010/`.
2. Fill admin credentials from local test data.
3. Click `Espelho de Ponto`.

Expected:

- The existing "Consulta e Espelho de Ponto" section remains.
- A new "Jornada diária" section appears above "Eventos detalhados".
- The selected date defaults to today.
- Cards render for collaborators who have records on that date.

- [ ] **Step 3: Verify search affects both views**

Type a collaborator name into the existing search field.

Expected:

- Daily journey cards filter to matching collaborator(s).
- Detailed table filters to matching collaborator(s).

- [ ] **Step 4: Verify date affects only daily journey**

Change the new journey date input to a date with known records.

Expected:

- Daily journey cards update for that date.
- Detailed audit table remains controlled by its existing period/type/status filters.

- [ ] **Step 5: Verify mobile layout**

Open the page with a mobile viewport around 390x844.

Expected:

- Journey cards do not overflow horizontally.
- Timeline becomes two columns.
- Text does not overlap buttons or filters.

- [ ] **Step 6: Verify production-like syntax**

Run:

```bash
npm test
node --check public/journey.js
node --check public/app.js
node --check server.js
```

Expected: all pass.

- [ ] **Step 7: Commit only if verification required small fixes**

If verification required fixes:

```bash
git add public/app.js public/index.html public/styles.css public/journey.js tests/journey.test.js package.json
git commit -m "Polish admin daily journey view"
```

If no fixes were needed, do not create an empty commit.

---

### Task 7: Final Review And PR Prep

**Files:**
- Review only unless small docs updates are needed.

- [ ] **Step 1: Review git diff**

Run:

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

Expected changed files:

- `package.json`
- `public/journey.js`
- `tests/journey.test.js`
- `public/index.html`
- `public/app.js`
- `public/styles.css`

- [ ] **Step 2: Run final verification**

Run:

```bash
npm test
node --check server.js
node --check public/journey.js
node --check public/app.js
```

Expected: all pass.

- [ ] **Step 3: Confirm no runtime logs are staged**

Run:

```bash
git status --short
```

Expected:

- No staged `server.err.log`
- No staged `server.out.log`
- No staged production `data/` files

- [ ] **Step 4: Push feature branch**

Use a new implementation branch, not the planning branch:

```bash
git switch main
git pull --ff-only origin main
git switch -c codex/admin-daily-journey-view
```

After completing implementation commits:

```bash
git push -u origin codex/admin-daily-journey-view
```

- [ ] **Step 5: PR summary**

Use this PR summary:

```markdown
## Summary
- Adds a daily journey view grouped by collaborator in the admin punch mirror
- Keeps the existing detailed events table for audit/edit/delete workflows
- Adds pure journey grouping helpers and Node tests

## Verification
- npm test
- node --check server.js
- node --check public/journey.js
- node --check public/app.js
- Browser check: admin login, Espelho de Ponto, journey cards, search, date, mobile viewport
```

---

## Self-Review Against Spec

- Admin daily grouped journey: covered by Tasks 2, 3, 4, and 5.
- Visual status for what was punched and what is missing: covered by helper status and journey card timeline.
- Operational inconsistency distinction: covered by helper attention list and no duplicate/invalid sequence detection.
- Existing detailed mirror remains: covered by placing new section above the existing audit table.
- Collaborator panel, profiles, class schedules, and Onvio reporting: intentionally excluded from this Fase 1 plan and left for later plans.

## Execution Recommendation

Use a fresh feature branch for implementation:

```bash
git switch main
git pull --ff-only origin main
git switch -c codex/admin-daily-journey-view
```

Keep the planning branch as documentation. Do not implement this plan directly on `codex/admin-reports-accounting-planning`.


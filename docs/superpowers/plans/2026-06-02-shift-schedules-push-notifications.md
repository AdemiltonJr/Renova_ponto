# Shift Schedules And Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add collaborator work schedules, expected journey calculations, hour totals, and mobile Web Push reminders for upcoming and missed punch times.

**Architecture:** Store each collaborator's expected weekly schedule separately from punch records, calculate expected daily events from that schedule, then compare expected events with approved punches. Use explicit browser/PWA notification opt-in, persist push subscriptions, and run a server-side minute scheduler that sends one reminder before the expected punch and one missed-punch reminder 5 minutes after the expected time.

**Tech Stack:** Node.js 20, vanilla JavaScript, existing JSON persistence, Service Worker, Web Push with VAPID keys, Node test runner.

---

## Scope And Assumptions

- The actual punch flow remains the same for all collaborators.
- The schedule is internal/admin data and does not block punches.
- Collaborators without specific weekdays work Monday through Friday.
- A schedule with two blocks creates expected `in`, `interval_in`, `interval_out`, and `out` events.
- A schedule with one block creates expected `in` and `out` events only.
- The missed-punch reminder is sent once, exactly 5 minutes after the expected event, when the corresponding punch is still missing.
- The "upcoming punch" reminder defaults to 10 minutes before the expected event and can be stored per schedule for later tuning.
- Web Push cannot bypass phone-level restrictions. Users must allow notifications, and iOS users may need to install the PWA on the home screen.

## Initial Schedule Seed

Use collaborator names only to seed the first schedule set; after that, schedules should be stored by `userId`.

```js
const initialSchedulesByName = {
  "Leonilda": { weekdays: [1, 2, 3, 4, 5], blocks: [["07:30", "12:00"], ["13:00", "17:30"]] },
  "Viviane": { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "17:30"]] },
  "Priscila": { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "17:30"]] },
  "Gabrielle": { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "18:00"]] },
  "Mayara": { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "18:00"]] },
  "Jaqueline": { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "18:00"]] },
  "Talita": { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "18:00"]] },
  "Rosilaine": { weekdays: [1, 2, 3, 4, 5], blocks: [["07:30", "17:30"]] },
  "Karen": { weekdays: [1, 2, 3, 4, 5], blocks: [["08:00", "18:00"]] },
  "Bianca": { weekdays: [1, 2, 3, 4, 5], blocks: [["07:30", "17:30"]] },
  "Rebeca": { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "17:30"]] },
  "Rosane": {
    days: {
      3: [["13:45", "17:15"]],
      4: [["14:30", "17:15"]]
    }
  },
  "Gabriel": {
    days: {
      1: [["13:45", "16:45"]],
      2: [["13:00", "17:15"]],
      4: [["13:00", "17:15"]],
      5: [["13:45", "16:45"]]
    }
  },
  "Leticia": {
    days: {
      1: [["15:30", "17:15"]],
      3: [["14:45", "17:15"]],
      5: [["14:00", "17:15"]]
    }
  }
};
```

## File Structure

- Create `public/schedule.js`: pure schedule/date/hour calculation helpers shared by browser and tests.
- Modify `public/journey.js`: attach expected schedule information and hour balance to daily journey objects.
- Modify `tests/schedule.test.js`: unit tests for schedule conversion, expected events, and hour totals.
- Modify `tests/journey.test.js`: tests for schedule-aware daily journeys and attention labels.
- Modify `server.js`: persistence for schedules, push subscriptions, notification delivery, and scheduler loop.
- Modify `public/index.html`: admin schedule management, collaborator notification activation, expected jornada fields.
- Modify `public/app.js`: fetch schedules, render expected jornada, subscribe/unsubscribe push, show notification state.
- Modify `public/sw.js`: handle push events and notification clicks.
- Modify `public/styles.css`: schedule and notification UI styling.
- Modify `package.json` and create `package-lock.json`: add `web-push`.
- Create `data/work-schedules.json` at runtime: ignored production schedule storage.
- Create `data/push-subscriptions.json` at runtime: ignored notification subscription storage.
- Create `data/notification-log.json` at runtime: ignored sent-notification log to prevent repeated alerts.

---

### Task 1: Add Schedule Calculation Helpers

**Files:**
- Create: `public/schedule.js`
- Test: `tests/schedule.test.js`

- [ ] **Step 1: Write failing tests for time parsing and expected events**

Create `tests/schedule.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseTimeToMinutes,
  formatMinutesAsDuration,
  getExpectedEventsForDate,
  calculateExpectedMinutesForDate
} = require("../public/schedule.js");

test("parseTimeToMinutes accepts HH:mm and H:mm", () => {
  assert.equal(parseTimeToMinutes("07:30"), 450);
  assert.equal(parseTimeToMinutes("8:00"), 480);
  assert.equal(parseTimeToMinutes("17:15"), 1035);
});

test("formatMinutesAsDuration formats signed hour balance", () => {
  assert.equal(formatMinutesAsDuration(270), "4h30");
  assert.equal(formatMinutesAsDuration(-35), "-0h35");
  assert.equal(formatMinutesAsDuration(0), "0h00");
});

test("getExpectedEventsForDate builds four events for two work blocks", () => {
  const schedule = {
    userId: "u1",
    active: true,
    days: { 1: [["07:30", "12:00"], ["13:00", "17:30"]] }
  };

  assert.deepEqual(
    getExpectedEventsForDate(schedule, "2026-06-01").map((event) => ({
      type: event.type,
      time: event.time
    })),
    [
      { type: "in", time: "07:30" },
      { type: "interval_in", time: "12:00" },
      { type: "interval_out", time: "13:00" },
      { type: "out", time: "17:30" }
    ]
  );
});

test("getExpectedEventsForDate builds two events for one work block", () => {
  const schedule = {
    userId: "u1",
    active: true,
    days: { 2: [["13:00", "17:30"]] }
  };

  assert.deepEqual(
    getExpectedEventsForDate(schedule, "2026-06-02").map((event) => event.type),
    ["in", "out"]
  );
});

test("calculateExpectedMinutesForDate sums all work blocks", () => {
  const schedule = {
    userId: "u1",
    active: true,
    days: { 1: [["07:30", "12:00"], ["13:00", "17:30"]] }
  };

  assert.equal(calculateExpectedMinutesForDate(schedule, "2026-06-01"), 540);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: failure because `public/schedule.js` does not exist.

- [ ] **Step 3: Implement `public/schedule.js`**

Create `public/schedule.js`:

```js
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RenovaSchedule = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const weekdayFromDateKey = (dateKey) => new Date(`${dateKey}T12:00:00`).getDay();

  function parseTimeToMinutes(value) {
    if (typeof value !== "string") throw new Error("time must be a string");
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) throw new Error(`invalid time: ${value}`);
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error(`invalid time: ${value}`);
    }
    return hours * 60 + minutes;
  }

  function normalizeTime(value) {
    const minutes = parseTimeToMinutes(value);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function formatMinutesAsDuration(totalMinutes) {
    const sign = totalMinutes < 0 ? "-" : "";
    const absolute = Math.abs(totalMinutes);
    const hours = Math.floor(absolute / 60);
    const minutes = absolute % 60;
    return `${sign}${hours}h${String(minutes).padStart(2, "0")}`;
  }

  function getBlocksForDate(schedule, dateKey) {
    if (!schedule || schedule.active === false) return [];
    const weekday = weekdayFromDateKey(dateKey);
    const blocks = schedule.days?.[weekday] || schedule.days?.[String(weekday)] || [];
    return blocks
      .map(([start, end]) => [normalizeTime(start), normalizeTime(end)])
      .sort((a, b) => parseTimeToMinutes(a[0]) - parseTimeToMinutes(b[0]));
  }

  function getExpectedEventsForDate(schedule, dateKey) {
    const blocks = getBlocksForDate(schedule, dateKey);
    if (!blocks.length) return [];

    const events = [{ type: "in", time: blocks[0][0], label: "Entrada" }];

    blocks.forEach((block, index) => {
      const isLast = index === blocks.length - 1;
      if (isLast) {
        events.push({ type: "out", time: block[1], label: "Saida" });
      } else {
        events.push({ type: "interval_in", time: block[1], label: "Intervalo" });
        events.push({ type: "interval_out", time: blocks[index + 1][0], label: "Retorno" });
      }
    });

    return events;
  }

  function calculateExpectedMinutesForDate(schedule, dateKey) {
    return getBlocksForDate(schedule, dateKey).reduce((total, [start, end]) => {
      return total + parseTimeToMinutes(end) - parseTimeToMinutes(start);
    }, 0);
  }

  return {
    parseTimeToMinutes,
    normalizeTime,
    formatMinutesAsDuration,
    getBlocksForDate,
    getExpectedEventsForDate,
    calculateExpectedMinutesForDate
  };
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: all existing tests and the new schedule tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/schedule.js tests/schedule.test.js
git commit -m "feat: add schedule calculation helpers"
```

---

### Task 2: Persist Work Schedules And Seed Existing Collaborators

**Files:**
- Modify: `server.js`
- Test: `tests/schedule.test.js`

- [ ] **Step 1: Add tests for seed conversion**

Append to `tests/schedule.test.js`:

```js
const { buildInitialScheduleForUser } = require("../server.js");

test("buildInitialScheduleForUser maps Leonilda to two blocks Monday through Friday", () => {
  const schedule = buildInitialScheduleForUser({ id: "u1", name: "Leonilda", role: "employee" });
  assert.equal(schedule.userId, "u1");
  assert.deepEqual(schedule.days[1], [["07:30", "12:00"], ["13:00", "17:30"]]);
  assert.deepEqual(schedule.days[5], [["07:30", "12:00"], ["13:00", "17:30"]]);
});

test("buildInitialScheduleForUser maps Gabriel only on configured weekdays", () => {
  const schedule = buildInitialScheduleForUser({ id: "u2", name: "Gabriel", role: "employee" });
  assert.deepEqual(Object.keys(schedule.days).sort(), ["1", "2", "4", "5"]);
  assert.deepEqual(schedule.days[1], [["13:45", "16:45"]]);
  assert.deepEqual(schedule.days[3], undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: failure because `buildInitialScheduleForUser` is not exported.

- [ ] **Step 3: Add JSON file paths and read/write helpers**

In `server.js`, near the existing data file constants, add:

```js
const schedulesFile = path.join(dataDir, "work-schedules.json");
const pushSubscriptionsFile = path.join(dataDir, "push-subscriptions.json");
const notificationLogFile = path.join(dataDir, "notification-log.json");
```

In `ensureData`, after the existing file creation calls, add:

```js
await ensureJsonFile(schedulesFile, []);
await ensureJsonFile(pushSubscriptionsFile, []);
await ensureJsonFile(notificationLogFile, []);
```

Add helpers near existing JSON helpers:

```js
const readSchedules = () => readJson(schedulesFile);
const writeSchedules = (schedules) => writeJson(schedulesFile, schedules);
const readPushSubscriptions = () => readJson(pushSubscriptionsFile);
const writePushSubscriptions = (subscriptions) => writeJson(pushSubscriptionsFile, subscriptions);
const readNotificationLog = () => readJson(notificationLogFile);
const writeNotificationLog = (log) => writeJson(notificationLogFile, log);
```

- [ ] **Step 4: Add seed function**

Add this in `server.js` before route handling:

```js
const initialSchedulesByName = {
  leonilda: { weekdays: [1, 2, 3, 4, 5], blocks: [["07:30", "12:00"], ["13:00", "17:30"]] },
  viviane: { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "17:30"]] },
  priscila: { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "17:30"]] },
  gabrielle: { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "18:00"]] },
  mayara: { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "18:00"]] },
  jaqueline: { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "18:00"]] },
  talita: { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "18:00"]] },
  rosilaine: { weekdays: [1, 2, 3, 4, 5], blocks: [["07:30", "17:30"]] },
  karen: { weekdays: [1, 2, 3, 4, 5], blocks: [["08:00", "18:00"]] },
  bianca: { weekdays: [1, 2, 3, 4, 5], blocks: [["07:30", "17:30"]] },
  rebeca: { weekdays: [1, 2, 3, 4, 5], blocks: [["13:00", "17:30"]] },
  rosane: { days: { 3: [["13:45", "17:15"]], 4: [["14:30", "17:15"]] } },
  gabriel: { days: { 1: [["13:45", "16:45"]], 2: [["13:00", "17:15"]], 4: [["13:00", "17:15"]], 5: [["13:45", "16:45"]] } },
  leticia: { days: { 1: [["15:30", "17:15"]], 3: [["14:45", "17:15"]], 5: [["14:00", "17:15"]] } }
};

function normalizeNameKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
}

function buildDaysFromWeekdays(seed) {
  if (seed.days) return seed.days;
  return seed.weekdays.reduce((days, weekday) => {
    days[weekday] = seed.blocks;
    return days;
  }, {});
}

function buildInitialScheduleForUser(user) {
  if (!user || user.role !== "employee") return null;
  const seed = initialSchedulesByName[normalizeNameKey(user.name)];
  if (!seed) return null;
  return {
    id: crypto.randomUUID(),
    userId: user.id,
    profile: "Colaborador",
    active: true,
    notifyBeforeMinutes: 10,
    missedReminderMinutes: 5,
    days: buildDaysFromWeekdays(seed),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
```

At the bottom of `server.js`, export helpers without changing production startup:

```js
module.exports = {
  buildInitialScheduleForUser
};
```

If `server.js` currently starts the server unconditionally, wrap startup with:

```js
if (require.main === module) {
  startServer();
}
```

Move existing startup code into `startServer()` so tests can import helpers without binding the HTTP port.

- [ ] **Step 5: Add admin schedule endpoints**

In authenticated route handling, add:

```js
if (url.pathname === "/api/admin/schedules" && user.role === "admin") {
  if (req.method === "GET") {
    const schedules = await readSchedules();
    return sendJson(res, 200, schedules);
  }

  if (req.method === "PUT") {
    const body = await readBody(req);
    const users = await readUsers();
    const target = users.find((item) => item.id === body.userId && item.role === "employee");
    if (!target) return sendJson(res, 404, { error: "Colaborador nao encontrado." });

    const days = body.days && typeof body.days === "object" ? body.days : null;
    if (!days) return sendJson(res, 400, { error: "Grade de horarios invalida." });

    const schedules = await readSchedules();
    const existingIndex = schedules.findIndex((item) => item.userId === target.id);
    const nextSchedule = {
      id: existingIndex >= 0 ? schedules[existingIndex].id : crypto.randomUUID(),
      userId: target.id,
      profile: String(body.profile || "Colaborador").trim(),
      active: body.active !== false,
      notifyBeforeMinutes: Number(body.notifyBeforeMinutes || 10),
      missedReminderMinutes: 5,
      days,
      createdAt: existingIndex >= 0 ? schedules[existingIndex].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) schedules[existingIndex] = nextSchedule;
    else schedules.push(nextSchedule);

    await writeSchedules(schedules);
    return sendJson(res, 200, nextSchedule);
  }
}
```

- [ ] **Step 6: Add seed endpoint or startup seed**

Prefer startup seed because production should self-heal when the new file is empty. After `ensureData()` and before accepting requests, add:

```js
async function seedMissingSchedules() {
  const [users, schedules] = await Promise.all([readUsers(), readSchedules()]);
  const existingUserIds = new Set(schedules.map((schedule) => schedule.userId));
  const additions = users
    .filter((user) => user.role === "employee" && !existingUserIds.has(user.id))
    .map(buildInitialScheduleForUser)
    .filter(Boolean);

  if (additions.length) {
    await writeSchedules([...schedules, ...additions]);
  }
}
```

Call it after `await ensureData();`:

```js
await seedMissingSchedules();
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add server.js tests/schedule.test.js
git commit -m "feat: persist collaborator work schedules"
```

---

### Task 3: Add Schedule-Aware Journey And Hour Calculations

**Files:**
- Modify: `public/journey.js`
- Modify: `public/app.js`
- Modify: `tests/journey.test.js`

- [ ] **Step 1: Write failing journey tests**

Append to `tests/journey.test.js`:

```js
test("buildDailyJourneys adds expected schedule and hour balance", () => {
  const punches = [
    punch({ userId: "u1", userName: "Leonilda", userCode: "leo", type: "in", createdAt: "2026-06-01T10:30:00.000Z" }),
    punch({ userId: "u1", userName: "Leonilda", userCode: "leo", type: "out", createdAt: "2026-06-01T21:30:00.000Z" })
  ];
  const schedules = [{
    userId: "u1",
    active: true,
    days: { 1: [["07:30", "12:00"], ["13:00", "17:30"]] }
  }];

  const [journey] = buildDailyJourneys(punches, { dateKey: "2026-06-01", schedules });

  assert.equal(journey.expectedMinutes, 540);
  assert.equal(journey.workedMinutes, 540);
  assert.equal(journey.balanceMinutes, 0);
  assert.equal(journey.expectedEvents.length, 4);
});

test("buildDailyJourneys flags expected event missing after the day has passed", () => {
  const punches = [
    punch({ userId: "u1", userName: "Viviane", userCode: "viviane", type: "in", createdAt: "2026-06-01T16:00:00.000Z" })
  ];
  const schedules = [{
    userId: "u1",
    active: true,
    days: { 1: [["13:00", "17:30"]] }
  }];

  const [journey] = buildDailyJourneys(punches, {
    dateKey: "2026-06-01",
    schedules,
    now: new Date("2026-06-02T12:00:00.000Z")
  });

  assert.equal(journey.expectedMinutes, 270);
  assert.ok(journey.attention.includes("Saida esperada sem marcacao"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: failure because `buildDailyJourneys` does not accept `schedules`.

- [ ] **Step 3: Load schedule helper in `journey.js`**

At the top of `public/journey.js`, load schedule utilities in both browser and Node contexts:

```js
const Schedule = typeof require === "function"
  ? require("./schedule.js")
  : window.RenovaSchedule;
```

If the existing UMD wrapper conflicts with top-level `require`, move this lookup inside the factory and pass `Schedule` as a dependency.

- [ ] **Step 4: Add worked-minute calculation**

Inside `public/journey.js`, add:

```js
function minutesBetweenPunches(startPunch, endPunch) {
  if (!startPunch || !endPunch) return 0;
  const start = new Date(startPunch.createdAt).getTime();
  const end = new Date(endPunch.createdAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60000);
}

function calculateWorkedMinutes(ins, intervalIns, intervalOuts, outs) {
  if (!ins.length) return 0;
  const firstIn = ins[0];
  const lastOut = outs[outs.length - 1] || null;

  if (!lastOut) {
    const firstIntervalIn = intervalIns[0] || null;
    return minutesBetweenPunches(firstIn, firstIntervalIn);
  }

  let total = minutesBetweenPunches(firstIn, lastOut);
  const pairs = Math.min(intervalIns.length, intervalOuts.length);
  for (let index = 0; index < pairs; index += 1) {
    total -= minutesBetweenPunches(intervalIns[index], intervalOuts[index]);
  }
  return Math.max(total, 0);
}
```

- [ ] **Step 5: Add expected schedule fields to journey objects**

In `buildDailyJourneys`, accept `schedules = []` and `now = new Date()` from options:

```js
const scheduleByUserId = new Map(schedules.map((schedule) => [schedule.userId, schedule]));
```

For each journey:

```js
const schedule = scheduleByUserId.get(userId) || null;
const expectedEvents = schedule ? Schedule.getExpectedEventsForDate(schedule, dateKey) : [];
const expectedMinutes = schedule ? Schedule.calculateExpectedMinutesForDate(schedule, dateKey) : 0;
const workedMinutes = calculateWorkedMinutes(ins, intervalIns, intervalOuts, outs);
const balanceMinutes = workedMinutes - expectedMinutes;
```

Add these properties to the returned object:

```js
schedule,
expectedEvents,
expectedMinutes,
workedMinutes,
balanceMinutes
```

- [ ] **Step 6: Add expected-missing attention labels**

Add a helper:

```js
function hasPunchForExpectedType(approved, type) {
  return approved.some((punch) => punch.type === type);
}

function buildExpectedAttention(expectedEvents, approved, dateKey, now) {
  const todayKey = getDateKey(now);
  const isPastDate = dateKey < todayKey;
  const isToday = dateKey === todayKey;

  return expectedEvents
    .filter((event) => {
      if (hasPunchForExpectedType(approved, event.type)) return false;
      if (isPastDate) return true;
      if (!isToday) return false;
      const expectedAt = new Date(`${dateKey}T${event.time}:00`).getTime();
      return now.getTime() > expectedAt + 5 * 60000;
    })
    .map((event) => `${event.label} esperada sem marcacao`);
}
```

Append its result to the existing `attention` array.

- [ ] **Step 7: Pass schedules from UI state**

In `public/app.js`, add `schedules: []` to state. Fetch `/api/admin/schedules` for admin and `/api/my-schedule` for collaborator if Task 4 adds the endpoint. Until Task 4, admin can pass an empty list and tests cover helper behavior.

Where journeys are rendered, change calls to:

```js
window.RenovaJourney.buildDailyJourneys(state.punches, {
  dateKey,
  search,
  schedules: state.schedules
});
```

- [ ] **Step 8: Run tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add public/journey.js public/app.js tests/journey.test.js
git commit -m "feat: calculate expected jornada from schedules"
```

---

### Task 4: Add Schedule APIs For Collaborators And Admin

**Files:**
- Modify: `server.js`
- Modify: `public/app.js`

- [ ] **Step 1: Add collaborator schedule endpoint**

In `server.js`, add authenticated route:

```js
if (url.pathname === "/api/my-schedule" && req.method === "GET") {
  const schedules = await readSchedules();
  const schedule = schedules.find((item) => item.userId === user.id) || null;
  return sendJson(res, 200, schedule);
}
```

- [ ] **Step 2: Add schedule loading to `public/app.js`**

Add:

```js
async function loadSchedules() {
  if (!state.user) return;
  if (state.user.role === "admin") {
    state.schedules = await api("/api/admin/schedules");
  } else {
    const schedule = await api("/api/my-schedule");
    state.schedules = schedule ? [schedule] : [];
  }
}
```

Call `await loadSchedules();` after user/session loading and before rendering journeys.

- [ ] **Step 3: Add error handling in the existing load flow**

Wrap schedule loading with existing message behavior:

```js
try {
  await loadSchedules();
} catch (error) {
  state.schedules = [];
  console.warn("Nao foi possivel carregar a grade de horarios.", error);
}
```

- [ ] **Step 4: Run verification**

Run:

```bash
node --check server.js
node --check public/app.js
npm test
```

Expected: syntax checks pass and tests pass.

- [ ] **Step 5: Commit**

```bash
git add server.js public/app.js
git commit -m "feat: expose collaborator schedules"
```

---

### Task 5: Render Expected Jornada And Hour Balance

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Add schedule script tag**

In `public/index.html`, before `journey.js`, add:

```html
<script src="/schedule.js" defer></script>
```

- [ ] **Step 2: Extend journey card rendering**

In `renderJourneyCard(journey, options = {})`, add a compact meta block:

```js
const hourSummary = journey.expectedMinutes
  ? `<div class="journey-hours">
      <span>Previsto <strong>${window.RenovaSchedule.formatMinutesAsDuration(journey.expectedMinutes)}</strong></span>
      <span>Realizado <strong>${window.RenovaSchedule.formatMinutesAsDuration(journey.workedMinutes)}</strong></span>
      <span>Saldo <strong>${window.RenovaSchedule.formatMinutesAsDuration(journey.balanceMinutes)}</strong></span>
    </div>`
  : "";
```

Insert `${hourSummary}` after the timeline.

- [ ] **Step 3: Show next expected punch for collaborator**

In `renderEmployeeJourney`, compute:

```js
function getNextExpectedEvent(journey) {
  const now = new Date();
  const todayKey = toDateInputValue();
  if (journey.dateKey !== todayKey) return null;
  return (journey.expectedEvents || []).find((event) => {
    const eventAt = new Date(`${journey.dateKey}T${event.time}:00`);
    return eventAt.getTime() >= now.getTime();
  }) || null;
}
```

Add to summary:

```js
const nextEvent = getNextExpectedEvent(journey);
const nextText = nextEvent ? ` · Proximo ponto: ${nextEvent.label} ${nextEvent.time}` : "";
elements.employeeJourneySummary.textContent = `${journey.statusLabel} ${dateLabel} · ${attentionText}${nextText}`;
```

- [ ] **Step 4: Style hour summary**

Add to `public/styles.css`:

```css
.journey-hours {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.journey-hours span {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px;
  color: var(--muted);
  font-size: 12px;
  background: var(--soft);
}

.journey-hours strong {
  display: block;
  color: var(--ink);
  font-size: 15px;
  margin-top: 2px;
}
```

- [ ] **Step 5: Run verification**

Run:

```bash
node --check public/app.js
npm test
```

Expected: syntax check and tests pass.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "feat: show expected jornada totals"
```

---

### Task 6: Add Push Subscription Support

**Files:**
- Modify: `package.json`
- Create: `package-lock.json`
- Modify: `server.js`
- Modify: `public/app.js`
- Modify: `public/sw.js`

- [ ] **Step 1: Install Web Push dependency**

Run:

```bash
npm install web-push
```

Expected: `package.json` and `package-lock.json` include `web-push`.

- [ ] **Step 2: Add VAPID environment validation**

In `server.js`, add:

```js
const webPush = require("web-push");

const vapidPublicKey = process.env.WEB_PUSH_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.WEB_PUSH_PRIVATE_KEY || "";
const vapidSubject = process.env.WEB_PUSH_SUBJECT || "mailto:admin@empreendemjuntos.com.br";

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}
```

- [ ] **Step 3: Add public key endpoint**

In `server.js`, add:

```js
if (url.pathname === "/api/push/public-key" && req.method === "GET") {
  if (!vapidPublicKey) return sendJson(res, 503, { error: "Notificacoes nao configuradas." });
  return sendJson(res, 200, { publicKey: vapidPublicKey });
}
```

- [ ] **Step 4: Add subscription endpoint**

In authenticated route handling:

```js
if (url.pathname === "/api/push/subscriptions" && req.method === "POST") {
  const body = await readBody(req);
  if (!body?.subscription?.endpoint) {
    return sendJson(res, 400, { error: "Inscricao de notificacao invalida." });
  }

  const subscriptions = await readPushSubscriptions();
  const filtered = subscriptions.filter((item) => item.endpoint !== body.subscription.endpoint);
  filtered.push({
    id: crypto.randomUUID(),
    userId: user.id,
    endpoint: body.subscription.endpoint,
    subscription: body.subscription,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await writePushSubscriptions(filtered);
  return sendJson(res, 200, { ok: true });
}
```

- [ ] **Step 5: Add browser subscription helpers**

In `public/app.js`, add:

```js
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function activatePushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Este navegador nao suporta notificacoes push.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissao de notificacao nao concedida.");
  }

  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await api("/api/push/public-key");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });

  await api("/api/push/subscriptions", {
    method: "POST",
    body: JSON.stringify({ subscription })
  });
}
```

- [ ] **Step 6: Add Service Worker push listener**

In `public/sw.js`, add:

```js
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Renova Ponto";
  const options = {
    body: data.body || "Voce tem uma nova notificacao.",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    data: data.url || "/"
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data || "/";
  event.waitUntil(clients.openWindow(url));
});
```

- [ ] **Step 7: Run verification**

Run:

```bash
node --check server.js
node --check public/app.js
npm test
```

Expected: syntax checks and tests pass.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json server.js public/app.js public/sw.js
git commit -m "feat: add web push subscriptions"
```

---

### Task 7: Add Notification Scheduler

**Files:**
- Modify: `server.js`
- Test: `tests/schedule.test.js`

- [ ] **Step 1: Add tests for due notification calculation**

Append to `tests/schedule.test.js`:

```js
const { getDueScheduleNotifications } = require("../server.js");

test("getDueScheduleNotifications sends upcoming reminder 10 minutes before", () => {
  const due = getDueScheduleNotifications({
    now: new Date("2026-06-01T12:50:00-03:00"),
    schedules: [{ userId: "u1", active: true, notifyBeforeMinutes: 10, missedReminderMinutes: 5, days: { 1: [["13:00", "17:30"]] } }],
    punches: [],
    sentLog: []
  });

  assert.equal(due.length, 1);
  assert.equal(due[0].kind, "upcoming");
  assert.equal(due[0].event.type, "in");
});

test("getDueScheduleNotifications sends one missed reminder five minutes after", () => {
  const due = getDueScheduleNotifications({
    now: new Date("2026-06-01T13:05:00-03:00"),
    schedules: [{ userId: "u1", active: true, notifyBeforeMinutes: 10, missedReminderMinutes: 5, days: { 1: [["13:00", "17:30"]] } }],
    punches: [],
    sentLog: []
  });

  assert.equal(due.length, 1);
  assert.equal(due[0].kind, "missed");
  assert.equal(due[0].event.type, "in");
});

test("getDueScheduleNotifications does not repeat a sent missed reminder", () => {
  const due = getDueScheduleNotifications({
    now: new Date("2026-06-01T13:05:00-03:00"),
    schedules: [{ userId: "u1", active: true, notifyBeforeMinutes: 10, missedReminderMinutes: 5, days: { 1: [["13:00", "17:30"]] } }],
    punches: [],
    sentLog: [{ key: "u1:2026-06-01:in:missed" }]
  });

  assert.equal(due.length, 0);
});
```

- [ ] **Step 2: Implement pure due-notification helper**

In `server.js`, import schedule helper:

```js
const Schedule = require("./public/schedule.js");
```

Add:

```js
function getLocalDateKey(date) {
  const local = new Date(date);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function hasPunchForEvent(punches, userId, dateKey, type) {
  return punches.some((punch) => {
    const punchDateKey = getLocalDateKey(new Date(punch.createdAt));
    return punch.userId === userId && punch.status === "approved" && punchDateKey === dateKey && punch.type === type;
  });
}

function notificationKey(userId, dateKey, type, kind) {
  return `${userId}:${dateKey}:${type}:${kind}`;
}

function getDueScheduleNotifications({ now, schedules, punches, sentLog }) {
  const dateKey = getLocalDateKey(now);
  const currentMinute = minutesOfDay(now);
  const sentKeys = new Set(sentLog.map((item) => item.key));
  const due = [];

  schedules.filter((schedule) => schedule.active !== false).forEach((schedule) => {
    const events = Schedule.getExpectedEventsForDate(schedule, dateKey);
    events.forEach((event) => {
      if (hasPunchForEvent(punches, schedule.userId, dateKey, event.type)) return;

      const eventMinute = Schedule.parseTimeToMinutes(event.time);
      const upcomingMinute = eventMinute - Number(schedule.notifyBeforeMinutes || 10);
      const missedMinute = eventMinute + 5;

      if (currentMinute === upcomingMinute) {
        const key = notificationKey(schedule.userId, dateKey, event.type, "upcoming");
        if (!sentKeys.has(key)) due.push({ key, kind: "upcoming", schedule, event, dateKey });
      }

      if (currentMinute === missedMinute) {
        const key = notificationKey(schedule.userId, dateKey, event.type, "missed");
        if (!sentKeys.has(key)) due.push({ key, kind: "missed", schedule, event, dateKey });
      }
    });
  });

  return due;
}
```

Export it with `buildInitialScheduleForUser`.

- [ ] **Step 3: Add send helper**

In `server.js`, add:

```js
async function sendPushToUser(userId, payload) {
  if (!vapidPublicKey || !vapidPrivateKey) return { sent: 0, skipped: true };
  const subscriptions = await readPushSubscriptions();
  const active = subscriptions.filter((item) => item.userId === userId && item.active !== false);
  let sent = 0;

  for (const item of active) {
    try {
      await webPush.sendNotification(item.subscription, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        item.active = false;
        item.updatedAt = new Date().toISOString();
      }
    }
  }

  await writePushSubscriptions(subscriptions);
  return { sent, skipped: false };
}
```

- [ ] **Step 4: Add scheduler loop**

In `server.js`, add:

```js
async function runScheduleNotificationTick() {
  const [schedules, punches, sentLog] = await Promise.all([
    readSchedules(),
    readPunches(),
    readNotificationLog()
  ]);

  const now = new Date();
  const due = getDueScheduleNotifications({ now, schedules, punches, sentLog });
  if (!due.length) return;

  for (const item of due) {
    const body = item.kind === "upcoming"
      ? `Seu ponto de ${item.event.label.toLowerCase()} esta chegando: ${item.event.time}.`
      : `Voce ainda nao registrou ${item.event.label.toLowerCase()} das ${item.event.time}.`;

    await sendPushToUser(item.schedule.userId, {
      title: "Renova Ponto",
      body,
      url: "/"
    });

    sentLog.push({
      key: item.key,
      userId: item.schedule.userId,
      dateKey: item.dateKey,
      type: item.event.type,
      kind: item.kind,
      sentAt: now.toISOString()
    });
  }

  await writeNotificationLog(sentLog.slice(-5000));
}

function startScheduleNotificationScheduler() {
  setInterval(() => {
    runScheduleNotificationTick().catch((error) => {
      console.error("Erro ao enviar notificacoes de ponto:", error);
    });
  }, 60000);
}
```

Call `startScheduleNotificationScheduler();` inside production startup after `seedMissingSchedules();`.

- [ ] **Step 5: Run tests and syntax checks**

Run:

```bash
node --check server.js
npm test
```

Expected: syntax check and tests pass.

- [ ] **Step 6: Commit**

```bash
git add server.js tests/schedule.test.js
git commit -m "feat: send schedule-based punch reminders"
```

---

### Task 8: Add Notification Activation UI

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Add collaborator notification panel**

In `public/index.html`, inside the collaborator app area near "Minha jornada", add:

```html
<section class="notification-panel" aria-labelledby="notificationHeading">
  <div>
    <p class="section-eyebrow">Notificacoes</p>
    <h3 id="notificationHeading">Lembretes do ponto</h3>
    <p id="notificationStatus">Ative para receber alertas no celular.</p>
  </div>
  <button id="activateNotificationsButton" class="secondary-button" type="button">Ativar notificacoes</button>
</section>
```

- [ ] **Step 2: Wire activation button**

In `elements`, add:

```js
activateNotificationsButton: document.querySelector("#activateNotificationsButton"),
notificationStatus: document.querySelector("#notificationStatus"),
```

Add:

```js
async function handleActivateNotifications() {
  try {
    elements.activateNotificationsButton.disabled = true;
    elements.notificationStatus.textContent = "Solicitando permissao...";
    await activatePushNotifications();
    elements.notificationStatus.textContent = "Notificacoes ativas neste aparelho.";
  } catch (error) {
    elements.notificationStatus.textContent = error.message || "Nao foi possivel ativar notificacoes.";
  } finally {
    elements.activateNotificationsButton.disabled = false;
  }
}
```

Register:

```js
elements.activateNotificationsButton?.addEventListener("click", handleActivateNotifications);
```

- [ ] **Step 3: Style panel**

Add to `public/styles.css`:

```css
.notification-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.notification-panel h3 {
  margin: 0;
  color: var(--brand);
  font-size: 20px;
}

.notification-panel p {
  margin: 4px 0 0;
  color: var(--muted);
}

@media (max-width: 720px) {
  .notification-panel {
    align-items: stretch;
    flex-direction: column;
  }
}
```

- [ ] **Step 4: Run verification**

Run:

```bash
node --check public/app.js
npm test
```

Expected: syntax check and tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "feat: add notification activation UI"
```

---

### Task 9: Add Admin Schedule Management UI

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Add admin schedule section**

In admin reports tab, add:

```html
<section class="schedule-admin-panel" aria-labelledby="scheduleAdminHeading">
  <div class="section-header">
    <div>
      <p class="section-eyebrow">Grade</p>
      <h3 id="scheduleAdminHeading">Horarios dos colaboradores</h3>
    </div>
  </div>
  <div id="scheduleAdminList" class="schedule-admin-list"></div>
</section>
```

- [ ] **Step 2: Render compact schedule rows**

In `public/app.js`, add:

```js
function formatScheduleDays(schedule) {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  return Object.entries(schedule.days || {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([weekday, blocks]) => {
      const blockText = blocks.map(([start, end]) => `${start}-${end}`).join(" / ");
      return `${labels[Number(weekday)]}: ${blockText}`;
    })
    .join(" · ");
}

function renderScheduleAdminList() {
  if (state.user?.role !== "admin" || !elements.scheduleAdminList) return;
  const usersById = new Map(state.users.map((user) => [user.id, user]));
  elements.scheduleAdminList.innerHTML = state.schedules.map((schedule) => {
    const user = usersById.get(schedule.userId);
    return `
      <article class="schedule-row">
        <strong>${escapeHtml(user?.name || "Colaborador")}</strong>
        <span>${escapeHtml(schedule.profile || "Colaborador")}</span>
        <p>${escapeHtml(formatScheduleDays(schedule))}</p>
      </article>
    `;
  }).join("");
}
```

Add `scheduleAdminList` to `elements` and call `renderScheduleAdminList()` inside admin render flow.

- [ ] **Step 3: Add styles**

Add to `public/styles.css`:

```css
.schedule-admin-panel {
  margin-top: 24px;
}

.schedule-admin-list {
  display: grid;
  gap: 10px;
}

.schedule-row {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
  background: var(--panel);
}

.schedule-row strong {
  display: block;
  color: var(--ink);
}

.schedule-row span,
.schedule-row p {
  color: var(--muted);
  margin: 4px 0 0;
}
```

- [ ] **Step 4: Run verification**

Run:

```bash
node --check public/app.js
npm test
```

Expected: syntax check and tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "feat: show admin collaborator schedules"
```

---

### Task 10: Production Deployment Preparation

**Files:**
- Modify: `.env.example` if present
- Modify: deployment notes or create `docs/deploy-push-notifications.md`

- [ ] **Step 1: Generate VAPID keys locally**

Run:

```bash
npx web-push generate-vapid-keys
```

Expected output includes `Public Key` and `Private Key`.

- [ ] **Step 2: Add production environment variables**

On VPS, add to the app `.env`:

```bash
WEB_PUSH_PUBLIC_KEY=public-key-from-step-1
WEB_PUSH_PRIVATE_KEY=private-key-from-step-1
WEB_PUSH_SUBJECT=mailto:admin@empreendemjuntos.com.br
```

- [ ] **Step 3: Back up production data before deploy**

On VPS:

```bash
cd /opt/renova-ponto
mkdir -p backups/pre-push-notifications-$(date +%Y%m%d-%H%M%S)
cp -a data backups/pre-push-notifications-$(date +%Y%m%d-%H%M%S)/
```

Expected: backup folder contains `punches.json`, `users.json`, `sessions.json`, `punch-requests.json`, and any existing data files.

- [ ] **Step 4: Deploy**

On VPS:

```bash
cd /opt/renova-ponto
git fetch origin codex/collaborator-daily-journey-panel
git checkout main
git merge --ff-only origin/codex/collaborator-daily-journey-panel
docker compose up -d --build ponto-renova
```

Expected: container rebuilds and starts.

- [ ] **Step 5: Verify production health**

On VPS:

```bash
docker compose ps
curl -I http://127.0.0.1:3001
ls -la data
```

Expected: service is healthy, HTTP returns `200`, and data files remain present.

- [ ] **Step 6: Manual browser test**

Use a collaborator login on a phone:

1. Open the PWA/site.
2. Tap "Ativar notificacoes".
3. Accept browser permission.
4. Confirm the status text changes to "Notificacoes ativas neste aparelho."
5. Temporarily set one collaborator schedule to a time 10 minutes ahead.
6. Wait for the upcoming notification.
7. Do not punch.
8. Confirm one missed reminder arrives 5 minutes after the expected time.

- [ ] **Step 7: Commit docs**

```bash
git add docs/deploy-push-notifications.md
git commit -m "docs: add push notification deployment notes"
```

---

## Self-Review

- Spec coverage: schedule storage, expected journey calculation, hour totals, push subscription, Service Worker push handling, and one missed reminder after 5 minutes are covered.
- Open-item scan: the plan contains no incomplete requirements.
- Type consistency: schedules consistently use `userId`, `active`, `notifyBeforeMinutes`, `missedReminderMinutes`, and `days`; notification log entries consistently use `key`, `userId`, `dateKey`, `type`, `kind`, and `sentAt`.
- Risk note: iOS and Android notification behavior depends on browser, PWA installation, and operating system settings; the implementation maximizes reach for a web app but cannot force notifications through a device that blocks them.

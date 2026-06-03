const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateExpectedMinutesForDate,
  formatMinutesAsDuration,
  formatScheduleDays,
  getExpectedEventsForDate,
  normalizeTime,
  parseTimeToMinutes,
  toIsoDateKey,
} = require("../public/schedule.js");
const {
  buildInitialScheduleForUser,
  getDueScheduleNotifications,
  normalizeNameKey,
  normalizeScheduleDays,
} = require("../server.js");

test("parseTimeToMinutes accepts HH:mm and H:mm", () => {
  assert.equal(parseTimeToMinutes("07:30"), 450);
  assert.equal(parseTimeToMinutes("8:00"), 480);
  assert.equal(parseTimeToMinutes("17:15"), 1035);
});

test("normalizeTime pads single digit hours", () => {
  assert.equal(normalizeTime("8:00"), "08:00");
});

test("toIsoDateKey returns a stable local date key", () => {
  assert.equal(toIsoDateKey("2026-06-01"), "2026-06-01");
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
    days: { 1: [["07:30", "12:00"], ["13:00", "17:30"]] },
  };

  assert.deepEqual(
    getExpectedEventsForDate(schedule, "2026-06-01").map((event) => ({
      type: event.type,
      time: event.time,
    })),
    [
      { type: "in", time: "07:30" },
      { type: "interval_in", time: "12:00" },
      { type: "interval_out", time: "13:00" },
      { type: "out", time: "17:30" },
    ],
  );
});

test("getExpectedEventsForDate builds two events for one work block", () => {
  const schedule = {
    userId: "u1",
    active: true,
    days: { 2: [["13:00", "17:30"]] },
  };

  assert.deepEqual(
    getExpectedEventsForDate(schedule, "2026-06-02").map((event) => event.type),
    ["in", "out"],
  );
});

test("calculateExpectedMinutesForDate sums all work blocks", () => {
  const schedule = {
    userId: "u1",
    active: true,
    days: { 1: [["07:30", "12:00"], ["13:00", "17:30"]] },
  };

  assert.equal(calculateExpectedMinutesForDate(schedule, "2026-06-01"), 540);
});

test("formatScheduleDays renders a compact weekly summary", () => {
  const schedule = {
    active: true,
    days: {
      1: [["13:45", "16:45"]],
      5: [["13:45", "16:45"]],
    },
  };

  assert.equal(formatScheduleDays(schedule), "Seg: 13:45-16:45 | Sex: 13:45-16:45");
});

test("normalizeNameKey removes accents and uses the first name", () => {
  assert.equal(normalizeNameKey("Letícia Silva"), "leticia");
});

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
  assert.equal(schedule.days[3], undefined);
});

test("buildInitialScheduleForUser maps accented Leticia name", () => {
  const schedule = buildInitialScheduleForUser({ id: "u3", name: "Letícia", role: "employee" });

  assert.deepEqual(schedule.days[1], [["15:30", "17:15"]]);
  assert.deepEqual(schedule.days[3], [["14:45", "17:15"]]);
});

test("normalizeScheduleDays pads times and rejects inverted blocks", () => {
  assert.deepEqual(normalizeScheduleDays({ 1: [["8:00", "18:00"]] }), { 1: [["08:00", "18:00"]] });
  assert.equal(normalizeScheduleDays({ 1: [["18:00", "08:00"]] }), null);
});

test("getDueScheduleNotifications sends upcoming reminder before expected punch", () => {
  const due = getDueScheduleNotifications({
    now: new Date("2026-06-01T12:50:00-03:00"),
    schedules: [{ userId: "u1", active: true, notifyBeforeMinutes: 10, missedReminderMinutes: 5, days: { 1: [["13:00", "17:30"]] } }],
    punches: [],
    sentLog: [],
  });

  assert.equal(due.length, 1);
  assert.equal(due[0].kind, "upcoming");
  assert.equal(due[0].event.type, "in");
  assert.equal(due[0].key, "u1:2026-06-01:in:upcoming");
});

test("getDueScheduleNotifications sends one missed reminder five minutes after", () => {
  const due = getDueScheduleNotifications({
    now: new Date("2026-06-01T13:05:00-03:00"),
    schedules: [{ userId: "u1", active: true, notifyBeforeMinutes: 10, missedReminderMinutes: 5, days: { 1: [["13:00", "17:30"]] } }],
    punches: [],
    sentLog: [],
  });

  assert.equal(due.length, 1);
  assert.equal(due[0].kind, "missed");
  assert.equal(due[0].event.type, "in");
});

test("getDueScheduleNotifications does not repeat sent reminders or remind after punch exists", () => {
  const dueWithLog = getDueScheduleNotifications({
    now: new Date("2026-06-01T13:05:00-03:00"),
    schedules: [{ userId: "u1", active: true, notifyBeforeMinutes: 10, missedReminderMinutes: 5, days: { 1: [["13:00", "17:30"]] } }],
    punches: [],
    sentLog: [{ key: "u1:2026-06-01:in:missed" }],
  });
  const dueWithPunch = getDueScheduleNotifications({
    now: new Date("2026-06-01T13:05:00-03:00"),
    schedules: [{ userId: "u1", active: true, notifyBeforeMinutes: 10, missedReminderMinutes: 5, days: { 1: [["13:00", "17:30"]] } }],
    punches: [{ userId: "u1", type: "in", status: "approved", createdAt: "2026-06-01T16:01:00.000Z" }],
    sentLog: [],
  });

  assert.equal(dueWithLog.length, 0);
  assert.equal(dueWithPunch.length, 0);
});

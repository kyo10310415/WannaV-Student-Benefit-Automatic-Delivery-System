const MISSION_NUMBERS = [1, 2, 3];
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function getJstDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function getJstMonthKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getJstDateParts(date);
  return `${parts.year}-${parts.month}`;
}

function isValidMonthKey(value) {
  return typeof value === 'string' && MONTH_KEY_PATTERN.test(value);
}

function getMonthLabel(month) {
  if (!isValidMonthKey(month)) return month;
  const [year, monthNumber] = month.split('-');
  return `${year}年${Number(monthNumber)}月`;
}

function createCounter() {
  return {
    sentCount: 0,
    completedCount: 0,
    studentIds: new Set()
  };
}

function createMonthCounter(month) {
  return {
    month,
    overall: createCounter(),
    missions: Object.fromEntries(MISSION_NUMBERS.map(no => [no, createCounter()]))
  };
}

function finalizeCounter(counter) {
  const achievementRate = counter.sentCount === 0
    ? 0
    : Math.round((counter.completedCount / counter.sentCount) * 1000) / 10;
  return {
    sentCount: counter.sentCount,
    completedCount: counter.completedCount,
    studentCount: counter.studentIds.size,
    achievementRate
  };
}

function finalizeMonth(counter) {
  return {
    month: counter.month,
    monthLabel: getMonthLabel(counter.month),
    overall: finalizeCounter(counter.overall),
    missions: Object.fromEntries(
      MISSION_NUMBERS.map(no => [no, finalizeCounter(counter.missions[no])])
    )
  };
}

function buildMissionMonthlyStats(historyRecords, requestedMonth) {
  const monthCounters = new Map();

  for (const record of historyRecords || []) {
    const missionNo = Number(record.mission_no);
    const month = getJstMonthKey(record.sent_at);
    if (!MISSION_NUMBERS.includes(missionNo) || !month) continue;

    if (!monthCounters.has(month)) {
      monthCounters.set(month, createMonthCounter(month));
    }

    const monthCounter = monthCounters.get(month);
    const missionCounter = monthCounter.missions[missionNo];
    const studentId = String(record.student_id || '');

    monthCounter.overall.sentCount++;
    missionCounter.sentCount++;
    if (studentId) {
      monthCounter.overall.studentIds.add(studentId);
      missionCounter.studentIds.add(studentId);
    }

    if (record.completed === true) {
      monthCounter.overall.completedCount++;
      missionCounter.completedCount++;
    }
  }

  const monthly = [...monthCounters.values()]
    .map(finalizeMonth)
    .sort((a, b) => b.month.localeCompare(a.month));
  const selectedMonth = isValidMonthKey(requestedMonth)
    ? requestedMonth
    : getJstMonthKey();
  const selected = monthly.find(item => item.month === selectedMonth)
    || finalizeMonth(createMonthCounter(selectedMonth));

  return {
    selectedMonth,
    selected,
    monthly
  };
}

module.exports = {
  buildMissionMonthlyStats,
  getJstMonthKey,
  getMonthLabel,
  isValidMonthKey
};

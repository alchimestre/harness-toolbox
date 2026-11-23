const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEK = DAYS.length;

function shiftWeekday(day, offset) {
  return DAYS[(DAYS.indexOf(day) + offset) % WEEK];
}

module.exports = { shiftWeekday };

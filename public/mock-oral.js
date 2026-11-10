/* The mock oral booking page.
   ------------------------------------------------------------------
   A page of its own, outside the portal, that a student reaches from a link and
   uses without signing in: pick a day, pick a time, type a name and an email.
   It is laid out the way a booking page usually is, with what it is on the
   left, the days in the middle and the free times on the right.

   Nothing on it is about anybody else. The server sends times and whether each
   is still free, and the only booking it will show is the one whose private
   link is in the address bar. */

const root = document.getElementById('mo-root');
const state = {
  step: 'loading', // loading | pick | details | booking
  days: [],
  me: null,
  dayId: null,
  slot: null,
  name: '',
  email: '',
  booking: null,
  token: null,
  /* Each day is its own mock oral, and somebody can book one on every day.
     These are the days this person already holds: from the portal if they are
     signed in, and from this visit either way. */
  booked: new Set(),
  justBooked: new Set(),
  fresh: false, // the booking on screen was made a moment ago, on this page
  asking: false, // "are you sure" is showing for a cancel
  busy: false,
  error: '',
};

const icon = {
  clock: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="12" height="12" rx="3" stroke="currentColor" stroke-width="2"/><path d="m15 10.5 6-3.5v10l-6-3.5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.500 18.400 12 21c-2.5-2.600-3.800-5.600-3.800-9S9.500 5.600 12 3Z" stroke="currentColor" stroke-width="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none"><path d="m5 12.5 4.500 4.500L19 7.500" stroke="currentColor" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5m0 0 6-6m-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

/* "10:20" as "10:20am". The times are the day's own, in Irish time, wherever
   the page is being read. */
function clock(value) {
  const [hour, minute] = String(value).split(':').map(Number);
  return `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
}

const shortDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-IE', {
  weekday: 'short', day: 'numeric', month: 'short',
}).replace(/,/g, '');

function longDate(date, year = true) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}),
  }).replace(/,/g, '');
}

async function api(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Try again in a moment.');
  return data;
}

const chosenDay = () => state.days.find((day) => day.id === state.dayId)
  || state.days.find((day) => !day.full && !state.booked.has(day.id))
  || state.days.find((day) => !day.full) || state.days[0];

/* ------------------------------------------------------------------ pieces */

/* The left of the card. What is being booked is said plainly and first: which
   mock, which date, and the time once one is picked. Four near-identical days
   are easy to mix up, and this is the thing that stops that. */
function infoPanel({ day = null, slot = null, back = false } = {}) {
  const chosen = day ? `<div class="mo-cal-chosen">
      <span>You are booking</span>
      <strong>${escapeHtml(day.label)}</strong>
      <em>${escapeHtml(longDate(day.date))}</em>
      ${slot ? `<b>${clock(slot.start)} to ${clock(slot.end)}</b>` : ''}
    </div>` : '';
  return `<aside class="mo-cal-info">
    ${back ? `<button class="mo-cal-back" id="mo-back" aria-label="Back to the times">${icon.back}</button>` : ''}
    <img class="mo-cal-logo" src="/logo.webp" alt="Gaeilgeoir Guides">
    <h1>Mock oral</h1>
    ${chosen}
    <ul>
      <li>${icon.clock}<span>20 minutes</span></li>
      <li>${icon.video}<span>Online. Your link to join is emailed to you before the day.</span></li>
      <li>${icon.globe}<span>All times are Irish time.</span></li>
    </ul>
  </aside>`;
}

function pickView() {
  const day = chosenDay();
  const times = day.slots.filter((slot) => !slot.full && !slot.past);
  const [year, month] = day.date.split('-').map(Number);
  const monthKey = day.date.slice(0, 7);
  const months = [...new Set(state.days.map((row) => row.date.slice(0, 7)))].sort();
  const at = months.indexOf(monthKey);
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const length = new Date(year, month, 0).getDate();
  const open = new Map(state.days.map((row) => [row.date, row]));

  const cells = [];
  for (let blank = 0; blank < offset; blank += 1) cells.push('<span></span>');
  for (let number = 1; number <= length; number += 1) {
    const found = open.get(`${monthKey}-${String(number).padStart(2, '0')}`);
    cells.push(found
      ? `<button class="mo-cal-day ${found.id === day.id ? 'on' : ''} ${state.booked.has(found.id) ? 'mine' : found.full ? 'full' : ''}" data-day="${found.id}"
          aria-pressed="${found.id === day.id}" aria-label="${escapeHtml(longDate(found.date))}${state.booked.has(found.id) ? ', you are booked' : found.full ? ', fully booked' : ''}">${number}</button>`
      : `<span class="mo-cal-day off">${number}</span>`);
  }
  const step = (to, label, arrow) => `<button class="mo-cal-step" ${months[to] ? `data-month="${months[to]}"` : 'disabled'} aria-label="${label}">${arrow}</button>`;

  const list = state.booked.has(day.id)
    ? `<p class="mo-cal-none">You are booked for ${escapeHtml(day.label)}. To change the time, cancel it first with the button in your confirmation email, then pick a new one.</p>`
    : times.length
    ? times.map((slot) => (slot.slot === state.slot
      ? `<div class="mo-slot chosen"><span>${clock(slot.start)}</span><button class="mo-next" id="mo-next">Next</button></div>`
      : `<button class="mo-slot" data-slot="${slot.slot}">${clock(slot.start)}</button>`)).join('')
    : '<p class="mo-cal-none">Every time on this day is taken. If somebody cancels, their time will show here.</p>';

  return `<section class="mo-cal">
    ${infoPanel({ day, slot: state.booked.has(day.id) ? null : times.find((slot) => slot.slot === state.slot) })}
    <div class="mo-cal-dates">
      <h2>${state.days.length > 1 ? 'Pick your mock and a time' : 'Pick a time'}</h2>
      ${state.days.length > 1 ? `<div class="mo-mocks">${state.days.map((row) => `
        <button class="mo-mock ${row.id === day.id ? 'on' : ''}" data-day="${row.id}" aria-pressed="${row.id === day.id}">
          <strong>${escapeHtml(row.label)}</strong>
          <span>${escapeHtml(shortDate(row.date))}</span>
          ${state.booked.has(row.id) ? '<small class="mine">Booked</small>' : row.full ? '<small>Full</small>' : ''}
        </button>`).join('')}</div>` : ''}
      <div class="mo-cal-month">
        <strong>${new Intl.DateTimeFormat('en-IE', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))}</strong>
        <span>${step(at - 1, 'Earlier month', '‹')}${step(at + 1, 'Later month', '›')}</span>
      </div>
      <div class="mo-cal-grid">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => `<span class="mo-cal-name">${name}</span>`).join('')}
        ${cells.join('')}
      </div>
    </div>
    <div class="mo-cal-times">
      <h3><strong>${escapeHtml(day.label)}</strong>${escapeHtml(longDate(day.date, false))}</h3>
      <div class="mo-cal-list">${list}</div>
    </div>
  </section>`;
}

function detailsView() {
  const day = chosenDay();
  const slot = day.slots.find((row) => row.slot === state.slot);
  return `<section class="mo-cal two">
    ${infoPanel({ day, slot, back: true })}
    <form class="mo-cal-form" id="mo-form" novalidate>
      <h2>Enter your details</h2>
      <label for="mo-name">Name</label>
      <input id="mo-name" name="name" autocomplete="name" maxlength="80" required value="${escapeHtml(state.name)}">
      <label for="mo-email">Email</label>
      <input id="mo-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="200" required value="${escapeHtml(state.email)}">
      <p class="mo-cal-small">Your confirmation, your link to join and your reminders are sent to this address.</p>
      ${state.error ? `<p class="mo-cal-error" role="alert">${escapeHtml(state.error)}</p>` : ''}
      <button class="mo-book" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Booking' : `Book ${escapeHtml(day.label)}`}</button>
    </form>
  </section>`;
}

function bookingView() {
  const booking = state.booking;
  const rows = `<dl class="mo-facts">
      <div><dt>Mock oral</dt><dd>${escapeHtml(booking.label)}</dd></div>
      <div><dt>Date</dt><dd>${escapeHtml(longDate(booking.date))}</dd></div>
      <div><dt>Time</dt><dd>${clock(booking.start)} to ${clock(booking.end)}</dd></div>
      <div><dt>Examiner</dt><dd>Examiner ${booking.examiner}${booking.examinerName ? ` (${escapeHtml(booking.examinerName)})` : ''}</dd></div>
    </dl>`;

  if (booking.status === 'cancelled') {
    return `<section class="mo-ticket mo-ticket-page">
      <div class="mo-ticket-head">
        <div><strong>${escapeHtml(booking.label)}: this booking is cancelled</strong><small>The place is open again for somebody else.</small></div>
      </div>
      ${rows}
      <div class="mo-ticket-foot"><span>Would you still like to do a mock oral?</span><button class="btn primary" id="mo-again">Pick another time</button></div>
    </section>`;
  }

  const foot = !booking.canCancel ? ''
    : state.asking
      ? `<div class="mo-ticket-foot">
          <span><strong>Cancel your mock oral?</strong> Your place goes to somebody else. You can pick another time afterwards if one is free.</span>
          <span class="mo-ticket-buttons"><button class="btn" id="mo-keep" ${state.busy ? 'disabled' : ''}>Keep it</button><button class="btn danger" id="mo-cancel-yes" ${state.busy ? 'disabled' : ''}>Cancel booking</button></span>
        </div>`
      : `<div class="mo-ticket-foot">
          <span>Cannot make it? Cancel so somebody else can have the place. You can then pick another time.</span>
          <button class="btn danger" id="mo-cancel">Cancel booking</button>
        </div>`;

  return `<section class="mo-ticket mo-ticket-page">
    <div class="mo-ticket-head">
      <span class="mo-ticket-tick">${icon.check}</span>
      <div><strong>You are booked for ${escapeHtml(booking.label)}</strong>
        <small>${state.fresh ? 'A confirmation is on its way to' : 'The details were emailed to'} ${escapeHtml(booking.email)}.</small></div>
    </div>
    ${rows}
    ${booking.link
      ? `<a class="btn primary mo-join" href="${escapeHtml(booking.link)}" target="_blank" rel="noopener">Join your mock oral</a>`
      : '<p class="mo-soon">Your link to join will be emailed to you before the day, and will show here.</p>'}
    ${booking.note ? `<p class="mo-note">${escapeHtml(booking.note)}</p>` : ''}
    ${state.error ? `<p class="mo-cal-error" role="alert">${escapeHtml(state.error)}</p>` : ''}
    ${foot}
    ${state.days.some((day) => !state.booked.has(day.id) && day.id !== booking.dayId)
      ? '<p class="mo-ticket-more">Each mock is booked separately. <button id="mo-again">Book another mock</button></p>' : ''}
  </section>`;
}

function emptyView() {
  return `<section class="mo-ticket mo-ticket-page">
    <img class="mo-cal-logo" src="/logo.webp" alt="Gaeilgeoir Guides">
    <div class="mo-ticket-head"><div><strong>No mock orals to book right now</strong>
      <small>${state.error ? escapeHtml(state.error) : 'When booking opens, the times will show here.'}</small></div></div>
  </section>`;
}

/* ------------------------------------------------------------------ screen */

function render() {
  const portal = state.me ? '<a class="mo-page-back" href="/">Back to the portal</a>' : '';
  let content;
  if (state.step === 'loading') content = '<div class="mo-loading"><div class="spinner"></div></div>';
  else if (state.step === 'booking') content = bookingView();
  else if (!state.days.length) content = emptyView();
  else if (state.step === 'details') content = detailsView();
  else content = pickView();
  root.innerHTML = `${portal}${content}<p class="mo-page-foot">Gaeilgeoir Guides</p>`;
  bind();
}

/* Choosing a time redraws the card, and the list of times would jump back to
   the top each time without this. */
function renderKeepingScroll() {
  const scrolled = document.querySelector('.mo-cal-list')?.scrollTop || 0;
  render();
  const list = document.querySelector('.mo-cal-list');
  if (list) list.scrollTop = scrolled;
}

async function loadDays() {
  const data = await api('/api/mock-oral/public');
  state.days = data.days;
  state.me = data.me;
  state.booked = new Set([...(data.booked || []), ...state.justBooked]);
  if (state.me) {
    state.name ||= state.me.name;
    state.email ||= state.me.email;
  }
  if (!state.days.some((day) => day.id === state.dayId)) { state.dayId = null; state.slot = null; }
}

function bind() {
  document.querySelectorAll('[data-day]').forEach((button) => button.addEventListener('click', () => {
    state.dayId = button.dataset.day;
    state.slot = null;
    render();
  }));
  document.querySelectorAll('[data-month]').forEach((button) => button.addEventListener('click', () => {
    const first = state.days.find((day) => day.date.startsWith(button.dataset.month));
    state.dayId = first.id;
    state.slot = null;
    render();
  }));
  document.querySelectorAll('[data-slot]').forEach((button) => button.addEventListener('click', () => {
    state.dayId = chosenDay().id;
    state.slot = Number(button.dataset.slot);
    renderKeepingScroll();
  }));
  document.getElementById('mo-next')?.addEventListener('click', () => {
    state.step = 'details';
    state.error = '';
    render();
    window.scrollTo(0, 0);
    document.getElementById(state.name ? (state.email ? 'mo-name' : 'mo-email') : 'mo-name')?.focus();
  });
  document.getElementById('mo-back')?.addEventListener('click', () => {
    state.step = 'pick';
    state.error = '';
    render();
  });

  const form = document.getElementById('mo-form');
  form?.addEventListener('input', () => {
    state.name = document.getElementById('mo-name').value;
    state.email = document.getElementById('mo-email').value;
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.busy) return;
    // Read from the fields themselves: a browser that fills them in for
    // somebody does not always say so.
    state.name = document.getElementById('mo-name').value;
    state.email = document.getElementById('mo-email').value;
    const name = state.name.trim();
    const email = state.email.trim();
    if (name.length < 2) { state.error = 'Enter your full name.'; render(); document.getElementById('mo-name').focus(); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { state.error = 'Enter a valid email address.'; render(); document.getElementById('mo-email').focus(); return; }
    state.busy = true;
    state.error = '';
    render();
    try {
      const done = await api('/api/mock-oral/public/book', {
        method: 'POST', body: { dayId: chosenDay().id, slot: state.slot, name, email },
      });
      state.booking = done.booking;
      state.token = done.token;
      state.fresh = true;
      state.step = 'booking';
      state.justBooked.add(done.booking.dayId);
      state.booked.add(done.booking.dayId);
      // So a refresh, or coming back to the tab later, still shows the booking.
      history.replaceState(null, '', `/mock-oral?b=${encodeURIComponent(done.token)}`);
    } catch (error) {
      state.error = error.message;
      // Somebody may have got there first: have what is really left ready behind the form.
      try { await loadDays(); } catch { /* the message above has said it */ }
      if (!chosenDay()?.slots.some((slot) => slot.slot === state.slot && !slot.full && !slot.past)) {
        state.slot = null;
        state.step = 'pick';
      }
    }
    state.busy = false;
    render();
    window.scrollTo(0, 0);
  });

  document.getElementById('mo-cancel')?.addEventListener('click', () => { state.asking = true; state.error = ''; render(); });
  document.getElementById('mo-keep')?.addEventListener('click', () => { state.asking = false; render(); });
  document.getElementById('mo-cancel-yes')?.addEventListener('click', async () => {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      const done = await api(`/api/mock-oral/public/booking/${encodeURIComponent(state.token)}/cancel`, { method: 'POST' });
      state.booking = done.booking;
      state.asking = false;
      // The day is theirs to book again.
      state.justBooked.delete(done.booking.dayId);
      state.booked.delete(done.booking.dayId);
    } catch (error) {
      state.error = error.message;
    }
    state.busy = false;
    render();
  });
  document.getElementById('mo-again')?.addEventListener('click', async () => {
    history.replaceState(null, '', '/mock-oral');
    state.step = 'loading';
    state.booking = null;
    state.token = null;
    state.fresh = false;
    state.dayId = null;
    state.slot = null;
    state.error = '';
    render();
    await showDays();
  });
}

/* `date` is the day a link asked for: the chip pressed on the portal calendar. */
async function showDays(date = null) {
  try {
    await loadDays();
  } catch (error) {
    state.days = [];
    state.error = error.message;
  }
  const asked = date && state.days.find((day) => day.date === date);
  if (asked) { state.dayId = asked.id; state.slot = null; }
  state.step = 'pick';
  render();
}

async function start() {
  const token = new URLSearchParams(location.search).get('b');
  if (token) {
    try {
      const found = await api(`/api/mock-oral/public/booking/${encodeURIComponent(token)}`);
      state.booking = found.booking;
      state.token = token;
      state.step = 'booking';
      // The other days, to offer them, and whether to offer the way back to the portal.
      loadDays().then(() => {
        // The booking this link is for is held too, whoever is looking at it.
        if (state.booking?.status === 'booked') { state.justBooked.add(state.booking.dayId); state.booked.add(state.booking.dayId); }
        if (state.step === 'booking') render();
      }).catch(() => {});
      return render();
    } catch {
      // A link that no longer leads anywhere: show the times instead.
      history.replaceState(null, '', '/mock-oral');
    }
  }
  await showDays(new URLSearchParams(location.search).get('day'));
}

start();

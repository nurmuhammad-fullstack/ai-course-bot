/* ===== AI Kurs Mini App — vanilla JS SPA ===== */
'use strict';

/* ---------- Telegram WebApp init ---------- */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#1FA05A');
  } catch (e) { /* eski versiyalar */ }
}

/* ---------- Konstantalar / formatlash ---------- */
const DAY_ABBR = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh']; // 0 = Yakshanba
const DAY_FULL = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];

function fmtMoney(n) {
  const num = Math.round(Number(n) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
}

function fmtDate(iso) {
  // "2026-07-19" -> "19-iyul"
  if (!iso) return '';
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso);
  return parseInt(m[3], 10) + '-' + MONTHS[parseInt(m[2], 10) - 1];
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return fmtDate(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return d.getDate() + '-' + MONTHS[d.getMonth()] + ', ' + hh + ':' + mm;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- SVG ikonkalar (Lucide uslubi) ---------- */
const ICON_PATHS = {
  home: '<path d="M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22v-8h6v8"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  chevron: '<polyline points="9 18 15 12 9 6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
};

function icon(name, size, cls) {
  size = size || 24;
  return '<svg class="' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON_PATHS[name] || '') + '</svg>';
}

/* ---------- DOM helperlar ---------- */
const root = document.getElementById('app');

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function skeletonScreen(count) {
  const wrap = el('<div class="screen"><div class="skeleton skeleton-header"></div></div>');
  for (let i = 0; i < (count || 3); i++) wrap.appendChild(el('<div class="skeleton skeleton-card"></div>'));
  return wrap;
}

function showErr(container, message) {
  const old = container.querySelector(':scope > .err-msg');
  if (old) old.remove();
  container.appendChild(el('<div class="err-msg">' + icon('alert', 16) + '<span>' + esc(message) + '</span></div>'));
}

function clearErr(container) {
  const old = container.querySelector(':scope > .err-msg');
  if (old) old.remove();
}

function setBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = !!busy;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = '<span class="inline-spin"></span>';
  } else if (btn.dataset.label) {
    btn.innerHTML = btn.dataset.label;
    delete btn.dataset.label;
  }
}

function askConfirm(message) {
  return new Promise((resolve) => {
    if (tg && typeof tg.showConfirm === 'function') {
      try { tg.showConfirm(message, (ok) => resolve(!!ok)); return; } catch (e) { /* fallback */ }
    }
    resolve(window.confirm(message));
  });
}

/* Bottom sheet */
function openSheet(contentEl) {
  const backdrop = el('<div class="sheet-backdrop"></div>');
  const sheet = el('<div class="sheet" role="dialog"><div class="sheet-handle"></div></div>');
  sheet.appendChild(contentEl);
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const close = () => { backdrop.remove(); sheet.remove(); };
  backdrop.addEventListener('click', close);
  return close;
}

/* ---------- API ---------- */
function api(path, opts) {
  opts = opts || {};
  return fetch(path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Init-Data': tg ? tg.initData || '' : '',
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  }).then(async (res) => {
    if (res.status === 401) {
      renderGate('telegram');
      throw Object.assign(new Error('Avtorizatsiya xatosi'), { silent: true });
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* bo'sh javob */ }
    if (!res.ok) {
      const msg = data && data.message
        ? (Array.isArray(data.message) ? data.message.join(', ') : data.message)
        : 'Xatolik yuz berdi (' + res.status + ')';
      throw new Error(msg);
    }
    return data;
  });
}

/* ---------- Global holat ---------- */
const state = {
  profile: null,
  tab: 'home',
  view: null, // tab ichidagi ichki ekran: {name, data}
};

/* ---------- Gate ekranlar ---------- */
function renderGate(kind) {
  clear(root);
  let iconName = 'send', title = '', text = '', showClose = false;
  if (kind === 'telegram') {
    title = 'Telegram orqali oching';
    text = "Bu ilova faqat Telegram bot ichidagi Mini App sifatida ishlaydi. Botga kirib, menyudan ilovani oching.";
  } else if (kind === 'pending') {
    iconName = 'clock';
    title = 'Arizangiz ko’rib chiqilmoqda';
    text = 'Admin sizni tasdiqlagach, ilova ochiladi. Iltimos, kuting.';
    showClose = true;
  } else { // guest
    iconName = 'alert';
    title = 'Botda ro’yxatdan o’ting';
    text = 'Avval botga /start yozib, ro’yxatdan o’ting. So’ng ilovani qayta oching.';
    showClose = true;
  }
  const gate = el(
    '<div class="gate"><div class="gate-card">' +
      '<div class="gate-icon">' + icon(iconName, 34) + '</div>' +
      '<h2>' + esc(title) + '</h2>' +
      '<p>' + esc(text) + '</p>' +
    '</div></div>'
  );
  if (showClose && tg) {
    const btn = el('<button type="button" class="btn btn-primary btn-block" style="margin-top:18px">Botga qaytish</button>');
    btn.addEventListener('click', () => tg.close());
    gate.querySelector('.gate-card').appendChild(btn);
  }
  root.appendChild(gate);
}

/* ---------- Bottom nav ---------- */
const TABS = {
  admin: [
    { id: 'home', label: 'Bosh', icon: 'home' },
    { id: 'students', label: "O'quvchilar", icon: 'users' },
    { id: 'tasks', label: 'Vazifalar', icon: 'clipboard' },
    { id: 'shop', label: 'Shop', icon: 'bag' },
    { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  ],
  student: [
    { id: 'home', label: 'Bosh', icon: 'home' },
    { id: 'tasks', label: 'Vazifalar', icon: 'clipboard' },
    { id: 'shop', label: 'Shop', icon: 'bag' },
  ],
};

function renderNav() {
  const tabs = TABS[state.profile.role];
  if (!tabs) return null;
  const nav = el('<nav class="bottom-nav" aria-label="Asosiy menyu"></nav>');
  tabs.forEach((t) => {
    const b = el(
      '<button type="button" class="nav-btn' + (state.tab === t.id ? ' active' : '') + '" data-tab="' + t.id + '">' +
        icon(t.icon, 22) + '<span>' + esc(t.label) + '</span>' +
      '</button>'
    );
    b.addEventListener('click', () => { state.tab = t.id; state.view = null; renderApp(); });
    nav.appendChild(b);
  });
  return nav;
}

/* ---------- Asosiy render ---------- */
function renderApp() {
  clear(root);
  const role = state.profile.role;

  if (role === 'pending') { renderGate('pending'); return; }
  if (role === 'guest') { renderGate('guest'); return; }

  if (role === 'parent') {
    root.appendChild(skeletonScreen(2));
    renderParent();
    return;
  }

  const nav = renderNav();
  root.appendChild(skeletonScreen(3));
  if (nav) root.appendChild(nav);

  const renderers = role === 'admin'
    ? { home: renderAdminHome, students: renderAdminStudents, tasks: renderAdminTasks, shop: renderAdminShop, inbox: renderAdminInbox }
    : { home: renderStudentHome, tasks: renderStudentTasks, shop: renderStudentShop };

  (renderers[state.tab] || renderers.home)();
}

function mountScreen(screenEl) {
  const old = root.querySelector('.screen, .boot-skeleton');
  if (old) old.replaceWith(screenEl);
  else root.prepend(screenEl);
}

function screenError(message, retry) {
  const s = el('<div class="screen"><div class="form-card"></div></div>');
  const card = s.querySelector('.form-card');
  showErr(card, message);
  const btn = el('<button type="button" class="btn btn-ghost btn-block" style="margin-top:12px">Qayta urinish</button>');
  btn.addEventListener('click', retry);
  card.appendChild(btn);
  mountScreen(s);
}

/* =========================================================
   ADMIN: BOSH
   ========================================================= */
function renderAdminHome() {
  if (state.view && state.view.name === 'finishLesson') { renderFinishLesson(); return; }

  api('/api/admin/home').then((data) => {
    const s = el('<div class="screen"></div>');
    const t = data.today || {};
    const now = new Date();

    const header = el(
      '<section class="header-card">' +
        '<div class="hc-date">' + icon('calendar', 15) + '<span>' + now.getDate() + '-' + MONTHS[now.getMonth()] + ', ' + esc(t.dayName || DAY_FULL[now.getDay()]) + '</span></div>' +
        '<div class="hc-title">' + (t.isLessonDay ? 'Bugun dars bor' : 'Bugun dars yo’q') + '</div>' +
        (t.isLessonDay && t.lessonTime
          ? '<div class="hc-sub">' + icon('clock', 15) + '<span>Boshlanish vaqti: ' + esc(t.lessonTime) + '</span></div>'
          : '<div class="hc-sub">' + icon('users', 15) + '<span>O’quvchilar: ' + (data.studentsCount || 0) + ' ta</span></div>') +
        '<button type="button" class="pill-btn" data-act="finish">' + icon('check', 18) + 'Darsni yakunlash</button>' +
      '</section>'
    );
    header.querySelector('[data-act="finish"]').addEventListener('click', (e) => {
      startFinishLesson(e.currentTarget, s);
    });
    s.appendChild(header);

    /* Hafta kun chiplari (joriy hafta sanalari bilan) */
    s.appendChild(el('<h2 class="section-title">Dars jadvali</h2>'));
    const chips = el('<div class="day-chips"></div>');
    const scheduleMap = {};
    (data.schedule || []).forEach((sc) => { scheduleMap[sc.dayOfWeek] = sc.lessonTime; });
    const order = [1, 2, 3, 4, 5, 6, 0]; // Du..Ya
    order.forEach((dow) => {
      const diff = dow - now.getDay();
      const d = new Date(now); d.setDate(now.getDate() + (dow === 0 ? (7 - now.getDay()) % 7 || (now.getDay() === 0 ? 0 : 7 - now.getDay()) : diff));
      // soddaroq: shu haftaning kuni (Du boshlangan hafta)
      const mondayOffset = (now.getDay() + 6) % 7;
      const monday = new Date(now); monday.setDate(now.getDate() - mondayOffset);
      const idx = order.indexOf(dow);
      const dd = new Date(monday); dd.setDate(monday.getDate() + idx);
      const isToday = dow === now.getDay();
      const hasLesson = scheduleMap[dow] != null;
      const chip = el(
        '<button type="button" class="day-chip' + (isToday ? ' active' : '') + '" aria-label="' + esc(DAY_FULL[dow]) + '">' +
          '<div class="dc-num">' + dd.getDate() + '</div>' +
          '<div class="dc-name">' + DAY_ABBR[dow] + '</div>' +
          '<div class="dc-dot' + (hasLesson ? '' : ' hidden') + '"></div>' +
        '</button>'
      );
      chip.addEventListener('click', () => openScheduleSheet(dow, scheduleMap[dow] || ''));
      chips.appendChild(chip);
    });
    s.appendChild(chips);

    /* Inbox hisoblagichlari */
    s.appendChild(el('<h2 class="section-title">Inbox</h2>'));
    const counts = data.counts || {};
    const inboxItems = [
      { key: 'requests', title: 'Zaproslar', sub: 'Yangi a’zolik so’rovlari', icon: 'users' },
      { key: 'submissions', title: 'Topshiriqlar', sub: 'Tekshirish kutilmoqda', icon: 'clipboard' },
      { key: 'orders', title: 'Buyurtmalar', sub: 'Shop buyurtmalari', icon: 'bag' },
    ];
    inboxItems.forEach((it) => {
      const n = counts[it.key] || 0;
      const card = el(
        '<button type="button" class="cat-card">' +
          '<div class="cc-icon">' + icon(it.icon, 22) + '</div>' +
          '<div class="cc-body"><div class="cc-title">' + it.title + '</div><div class="cc-sub">' + it.sub + '</div></div>' +
          '<div class="cc-right"><span class="cc-badge' + (n ? '' : ' zero') + '">' + n + '</span>' + icon('chevron', 20) + '</div>' +
        '</button>'
      );
      card.addEventListener('click', () => { state.tab = 'inbox'; state.view = null; renderApp(); });
      s.appendChild(card);
    });

    mountScreen(s);
  }).catch((e) => { if (!e.silent) screenError(e.message, renderAdminHome); });
}

function openScheduleSheet(dow, currentTime) {
  const content = el(
    '<div>' +
      '<h3>' + esc(DAY_FULL[dow]) + ' — dars vaqti</h3>' +
      '<div class="field"><label for="sch-time">Boshlanish vaqti</label>' +
      '<input id="sch-time" type="time" value="' + esc(currentTime) + '" /></div>' +
      '<button type="button" class="btn btn-primary btn-block" data-act="save">Saqlash</button>' +
    '</div>'
  );
  const close = openSheet(content);
  const btn = content.querySelector('[data-act="save"]');
  btn.addEventListener('click', () => {
    const time = content.querySelector('#sch-time').value;
    if (!time) { showErr(content, 'Vaqtni kiriting'); return; }
    clearErr(content);
    setBusy(btn, true);
    api('/api/admin/schedule', { method: 'PUT', body: { dayOfWeek: dow, lessonTime: time } })
      .then(() => { close(); renderAdminHome(); })
      .catch((e) => { setBusy(btn, false); if (!e.silent) showErr(content, e.message); });
  });
}

/* --- Darsni yakunlash oqimi --- */
function startFinishLesson(btn, container) {
  setBusy(btn, true);
  api('/api/admin/lesson/finish', { method: 'POST', body: {} })
    .then((lesson) => {
      state.view = { name: 'finishLesson', data: lesson };
      renderFinishLesson();
    })
    .catch((e) => {
      setBusy(btn, false);
      if (!e.silent) showErr(container.querySelector('.header-card') || container, e.message);
    });
}

function renderFinishLesson() {
  const lesson = state.view.data;
  const s = el('<div class="screen"></div>');

  const back = el('<button type="button" class="back-btn">' + icon('chevron', 18) + 'Orqaga</button>');
  back.addEventListener('click', () => { state.view = null; renderApp(); });
  s.appendChild(back);

  s.appendChild(el(
    '<section class="header-card">' +
      '<div class="hc-date">' + icon('calendar', 15) + '<span>' + esc(fmtDate(lesson.date)) + '</span></div>' +
      '<div class="hc-title">' + lesson.lessonNumber + '-dars davomati</div>' +
      '<div class="hc-sub">' + icon('users', 15) + '<span>Har bir o’quvchini belgilang</span></div>' +
    '</section>'
  ));

  const STATUSES = [
    { val: 'came', label: 'Keldi', cls: 'seg-green' },
    { val: 'missed_unexcused', label: 'Sababsiz', cls: 'seg-red' },
    { val: 'missed_excused', label: 'Ogohlantirgan', cls: 'seg-amber' },
  ];

  (lesson.students || []).forEach((st) => {
    const card = el(
      '<div class="form-card">' +
        '<h3 style="margin-bottom:10px">' + esc(st.name) + '</h3>' +
        '<div class="segment"></div>' +
      '</div>'
    );
    const seg = card.querySelector('.segment');
    STATUSES.forEach((opt) => {
      const b = el('<button type="button" class="seg-btn ' + (st.attendance === opt.val ? 'active ' : '') + opt.cls.replace('seg-', 'x-') + '" data-val="' + opt.val + '">' + opt.label + '</button>');
      if (st.attendance === opt.val) b.classList.add('active', opt.cls);
      b.addEventListener('click', () => {
        clearErr(card);
        seg.querySelectorAll('.seg-btn').forEach((x) => { x.disabled = true; });
        api('/api/admin/attendance', { method: 'POST', body: { lessonId: lesson.lessonId, studentId: st.id, status: opt.val } })
          .then((res) => {
            seg.querySelectorAll('.seg-btn').forEach((x) => {
              x.disabled = false;
              x.classList.remove('active', 'seg-green', 'seg-red', 'seg-amber');
            });
            b.classList.add('active', opt.cls);
            st.attendance = opt.val;
            const oldNote = card.querySelector('.pay-note');
            if (oldNote) oldNote.remove();
            const noteText = (res.paymentNote ? res.paymentNote + ' · ' : '') +
              'Qoldiq: ' + fmtMoney(res.remaining) + ' · ' + (res.lessonsLeft != null ? res.lessonsLeft + ' dars' : '');
            card.appendChild(el('<div class="pay-note">' + esc(noteText) + '</div>'));
          })
          .catch((e) => {
            seg.querySelectorAll('.seg-btn').forEach((x) => { x.disabled = false; });
            if (!e.silent) showErr(card, e.message);
          });
      });
      seg.appendChild(b);
    });
    s.appendChild(card);
  });

  if (!(lesson.students || []).length) {
    s.appendChild(el('<div class="empty-state">' + icon('users', 32) + '<div>O’quvchilar topilmadi</div></div>'));
  }

  mountScreen(s);
}

/* =========================================================
   ADMIN: O'QUVCHILAR
   ========================================================= */
function renderAdminStudents() {
  api('/api/admin/students').then((students) => {
    const s = el('<div class="screen"></div>');
    s.appendChild(el(
      '<section class="header-card">' +
        '<div class="hc-date">' + icon('users', 15) + '<span>Jami: ' + students.length + ' ta</span></div>' +
        '<div class="hc-title">O’quvchilar</div>' +
      '</section>'
    ));

    if (!students.length) {
      s.appendChild(el('<div class="empty-state">' + icon('users', 32) + '<div>Hozircha o’quvchilar yo’q</div></div>'));
    }

    students.forEach((st) => {
      const pay = st.pay || {};
      const att = st.attendance || {};
      const card = el(
        '<button type="button" class="cat-card">' +
          '<div class="cc-icon">' + icon('users', 22) + '</div>' +
          '<div class="cc-body">' +
            '<div class="cc-title">' + esc(st.name) + '</div>' +
            '<div class="cc-sub">' +
              '<span class="strong">' + fmtMoney(pay.remaining || 0) + '</span>' +
              '<span>· ' + (pay.lessonsLeft != null ? pay.lessonsLeft : '?') + ' dars</span>' +
              '<span class="att-stat good">' + icon('check', 13) + (att.came || 0) + '</span>' +
              '<span class="att-stat bad">' + icon('x', 13) + (att.missed || 0) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="cc-right"><span class="att-stat" style="color:var(--amber)">' + icon('coins', 15) + '<b>' + (st.coins || 0) + '</b></span>' + icon('chevron', 20) + '</div>' +
        '</button>'
      );
      card.addEventListener('click', () => openStudentSheet(st));
      s.appendChild(card);
    });

    mountScreen(s);
  }).catch((e) => { if (!e.silent) screenError(e.message, renderAdminStudents); });
}

function openStudentSheet(st) {
  const pay = st.pay || {};
  const att = st.attendance || {};
  const content = el(
    '<div>' +
      '<h3>' + esc(st.name) + '</h3>' +
      '<div class="detail-list">' +
        '<div class="detail-row"><span class="dr-label">' + icon('users', 15) + 'Telefon</span><span class="dr-value">' + esc(st.phone || '—') + '</span></div>' +
        '<div class="detail-row"><span class="dr-label">' + icon('coins', 15) + 'Coin balans</span><span class="dr-value">' + (st.coins || 0) + '</span></div>' +
        '<div class="detail-row"><span class="dr-label">' + icon('check', 15) + 'Kelgan darslar</span><span class="dr-value">' + (att.came || 0) + ' ta</span></div>' +
        '<div class="detail-row"><span class="dr-label">' + icon('x', 15) + 'Qoldirgan darslar</span><span class="dr-value">' + (att.missed || 0) + ' ta</span></div>' +
        '<div class="detail-row"><span class="dr-label">' + icon('clipboard', 15) + 'Hisoblangan</span><span class="dr-value">' + fmtMoney(pay.charged || 0) + ' (' + (pay.chargedCount || 0) + ' dars)</span></div>' +
        '<div class="detail-row"><span class="dr-label">' + icon('coins', 15) + 'Qoldiq</span><span class="dr-value">' + fmtMoney(pay.remaining || 0) + ' · ' + (pay.lessonsLeft != null ? pay.lessonsLeft : '?') + ' dars</span></div>' +
        '<div class="detail-row"><span class="dr-label">' + icon('calendar', 15) + 'Kurs jami</span><span class="dr-value">' + fmtMoney(pay.total || 0) + ' · ' + (pay.lessonsCount || 0) + ' dars</span></div>' +
      '</div>' +
    '</div>'
  );
  openSheet(content);
}

/* =========================================================
   ADMIN: VAZIFALAR
   ========================================================= */
function renderAdminTasks() {
  if (state.view && state.view.name === 'taskCreate') { renderTaskCreate(); return; }

  api('/api/admin/tasks').then((tasks) => {
    const s = el('<div class="screen"></div>');
    s.appendChild(el(
      '<section class="header-card">' +
        '<div class="hc-date">' + icon('clipboard', 15) + '<span>Jami: ' + tasks.length + ' ta</span></div>' +
        '<div class="hc-title">Vazifalar</div>' +
      '</section>'
    ));

    if (!tasks.length) {
      s.appendChild(el('<div class="empty-state">' + icon('clipboard', 32) + '<div>Vazifalar hali yo’q. «+» bilan yarating.</div></div>'));
    }

    tasks.forEach((task) => {
      const isQuiz = task.type === 'quiz';
      const card = el(
        '<div class="cat-card static" role="listitem">' +
          '<div class="cc-icon' + (task.isActive ? '' : ' red') + '">' + icon(isQuiz ? 'clipboard' : 'send', 22) + '</div>' +
          '<div class="cc-body">' +
            '<div class="cc-title">' + esc(task.title) + '</div>' +
            '<div class="cc-sub">' +
              '<span>' + (isQuiz ? 'Quiz · ' + (task.questionsCount || 0) + ' savol' : 'Topshiriq') + '</span>' +
              '<span class="att-stat" style="color:var(--amber)">' + icon('coins', 13) + task.coinReward + '</span>' +
              (task.isActive
                ? '<span class="status-chip green">Faol</span>'
                : '<span class="status-chip gray">Nofaol</span>') +
            '</div>' +
          '</div>' +
        '</div>'
      );
      if (task.isActive) {
        const btn = el('<button type="button" class="btn btn-red btn-sm">O’chirish</button>');
        btn.addEventListener('click', async () => {
          const ok = await askConfirm('«' + task.title + '» vazifasini nofaol qilasizmi?');
          if (!ok) return;
          setBusy(btn, true);
          api('/api/admin/tasks/' + task.id + '/deactivate', { method: 'POST', body: {} })
            .then(() => renderAdminTasks())
            .catch((e) => { setBusy(btn, false); if (!e.silent) showErr(card, e.message); });
        });
        card.appendChild(btn);
      }
      s.appendChild(card);
    });

    const fab = el('<button type="button" class="fab" aria-label="Yangi vazifa">' + icon('plus', 26) + '</button>');
    fab.addEventListener('click', () => { state.view = { name: 'taskCreate' }; renderTaskCreate(); });
    s.appendChild(fab);

    mountScreen(s);
  }).catch((e) => { if (!e.silent) screenError(e.message, renderAdminTasks); });
}

function renderTaskCreate() {
  const s = el('<div class="screen"></div>');
  const back = el('<button type="button" class="back-btn">' + icon('chevron', 18) + 'Orqaga</button>');
  back.addEventListener('click', () => { state.view = null; renderApp(); });
  s.appendChild(back);

  const form = el(
    '<div class="form-card">' +
      '<h3>Yangi vazifa</h3>' +
      '<div class="field"><label>Turi</label>' +
        '<div class="segment" data-role="type">' +
          '<button type="button" class="seg-btn active seg-green" data-type="assignment">Topshiriq</button>' +
          '<button type="button" class="seg-btn" data-type="quiz">Quiz</button>' +
        '</div>' +
      '</div>' +
      '<div class="field"><label for="t-title">Nomi</label><input id="t-title" type="text" placeholder="Masalan: 5-dars uy vazifasi" /></div>' +
      '<div class="field"><label for="t-coin">Coin mukofoti</label><input id="t-coin" type="number" inputmode="numeric" min="0" placeholder="10" /></div>' +
      '<div class="field" data-role="desc-field"><label for="t-desc">Tavsif</label><textarea id="t-desc" placeholder="Vazifa tavsifi..."></textarea></div>' +
      '<div data-role="questions" hidden>' +
        '<div class="field"><label>Savollar</label><div data-role="q-list"></div>' +
        '<button type="button" class="btn btn-green-soft btn-block btn-sm" data-act="add-q">' + icon('plus', 16) + 'Savol qo’shish</button></div>' +
      '</div>' +
      '<button type="button" class="btn btn-primary btn-block" data-act="save">Yaratish va yuborish</button>' +
    '</div>'
  );
  s.appendChild(form);

  let type = 'assignment';
  const typeSeg = form.querySelector('[data-role="type"]');
  const qWrap = form.querySelector('[data-role="questions"]');
  const qList = form.querySelector('[data-role="q-list"]');
  const descField = form.querySelector('[data-role="desc-field"]');

  typeSeg.querySelectorAll('.seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      type = b.dataset.type;
      typeSeg.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active', 'seg-green'));
      b.classList.add('active', 'seg-green');
      qWrap.hidden = type !== 'quiz';
      descField.hidden = type === 'quiz';
      if (type === 'quiz' && !qList.children.length) addQuestion();
    });
  });

  function addQuestion() {
    const n = qList.children.length + 1;
    const q = el(
      '<div class="q-block">' +
        '<div class="q-head"><span>' + n + '-savol</span>' +
          '<button type="button" class="q-remove" aria-label="Savolni o’chirish">' + icon('x', 18) + '</button></div>' +
        '<div class="field"><input type="text" data-q="question" placeholder="Savol matni" /></div>' +
        '<div class="field"><input type="text" data-q="options" placeholder="Variantlar (vergul bilan): a, b, c" /></div>' +
        '<div class="field"><label>To’g’ri javob</label><select data-q="correct"></select></div>' +
      '</div>'
    );
    const optInput = q.querySelector('[data-q="options"]');
    const sel = q.querySelector('[data-q="correct"]');
    optInput.addEventListener('input', () => {
      const opts = optInput.value.split(',').map((x) => x.trim()).filter(Boolean);
      sel.innerHTML = opts.map((o, i) => '<option value="' + i + '">' + esc(o) + '</option>').join('');
    });
    q.querySelector('.q-remove').addEventListener('click', () => {
      q.remove();
      Array.from(qList.children).forEach((blk, i) => {
        blk.querySelector('.q-head span').textContent = (i + 1) + '-savol';
      });
    });
    qList.appendChild(q);
  }
  form.querySelector('[data-act="add-q"]').addEventListener('click', addQuestion);

  const saveBtn = form.querySelector('[data-act="save"]');
  saveBtn.addEventListener('click', () => {
    clearErr(form);
    const title = form.querySelector('#t-title').value.trim();
    const coin = parseInt(form.querySelector('#t-coin').value, 10);
    if (!title) { showErr(form, 'Nomini kiriting'); return; }
    if (isNaN(coin) || coin < 0) { showErr(form, 'Coin mukofotini kiriting'); return; }

    let body;
    if (type === 'quiz') {
      const questions = [];
      for (const blk of qList.children) {
        const question = blk.querySelector('[data-q="question"]').value.trim();
        const options = blk.querySelector('[data-q="options"]').value.split(',').map((x) => x.trim()).filter(Boolean);
        const correctIndex = parseInt(blk.querySelector('[data-q="correct"]').value, 10);
        if (!question || options.length < 2 || isNaN(correctIndex)) {
          showErr(form, 'Har bir savolda matn, kamida 2 variant va to’g’ri javob bo’lishi kerak');
          return;
        }
        questions.push({ question, options, correctIndex });
      }
      if (!questions.length) { showErr(form, 'Kamida bitta savol qo’shing'); return; }
      body = { type: 'quiz', title, coinReward: coin, questions };
    } else {
      body = { type: 'assignment', title, description: form.querySelector('#t-desc').value.trim(), coinReward: coin };
    }

    setBusy(saveBtn, true);
    api('/api/admin/tasks', { method: 'POST', body })
      .then(() => { state.view = null; renderApp(); })
      .catch((e) => { setBusy(saveBtn, false); if (!e.silent) showErr(form, e.message); });
  });

  mountScreen(s);
}

/* =========================================================
   ADMIN: SHOP
   ========================================================= */
function renderAdminShop() {
  api('/api/admin/shop').then((data) => {
    const s = el('<div class="screen"></div>');
    const items = data.items || [];
    const orders = data.orders || [];

    s.appendChild(el(
      '<section class="header-card">' +
        '<div class="hc-date">' + icon('bag', 15) + '<span>Sovg’alar: ' + items.length + ' · Buyurtmalar: ' + orders.length + '</span></div>' +
        '<div class="hc-title">Shop</div>' +
      '</section>'
    ));

    s.appendChild(el('<h2 class="section-title">Sovg’alar</h2>'));
    if (!items.length) {
      s.appendChild(el('<div class="empty-state">' + icon('gift', 32) + '<div>Sovg’alar yo’q. «+» bilan qo’shing.</div></div>'));
    }
    items.forEach((it) => {
      const card = el(
        '<div class="cat-card static">' +
          '<div class="cc-icon">' + icon('gift', 22) + '</div>' +
          '<div class="cc-body"><div class="cc-title">' + esc(it.name) + '</div>' +
            '<div class="cc-sub"><span class="att-stat" style="color:var(--amber)">' + icon('coins', 13) + it.price + ' coin</span></div></div>' +
        '</div>'
      );
      const btn = el('<button type="button" class="btn btn-red btn-sm">O’chirish</button>');
      btn.addEventListener('click', async () => {
        const ok = await askConfirm('«' + it.name + '» sovg’asini o’chirasizmi?');
        if (!ok) return;
        setBusy(btn, true);
        api('/api/admin/shop/' + it.id + '/deactivate', { method: 'POST', body: {} })
          .then(() => renderAdminShop())
          .catch((e) => { setBusy(btn, false); if (!e.silent) showErr(card, e.message); });
      });
      card.appendChild(btn);
      s.appendChild(card);
    });

    s.appendChild(el('<h2 class="section-title">Kutilayotgan buyurtmalar</h2>'));
    if (!orders.length) {
      s.appendChild(el('<div class="empty-state">' + icon('inbox', 32) + '<div>Buyurtmalar yo’q</div></div>'));
    }
    orders.forEach((o) => s.appendChild(orderCard(o, renderAdminShop)));

    const fab = el('<button type="button" class="fab" aria-label="Sovg’a qo’shish">' + icon('plus', 26) + '</button>');
    fab.addEventListener('click', openAddItemSheet);
    s.appendChild(fab);

    mountScreen(s);
  }).catch((e) => { if (!e.silent) screenError(e.message, renderAdminShop); });
}

function orderCard(o, refresh) {
  const card = el(
    '<div class="form-card">' +
      '<div class="cc-title" style="font-size:15px">' + esc(o.itemName) + '</div>' +
      '<div class="cc-sub" style="display:flex;gap:8px;align-items:center;font-size:13px;color:var(--text-2);margin-top:2px">' +
        '<span>' + esc(o.studentName) + '</span>' +
        '<span class="att-stat" style="color:var(--amber)">' + icon('coins', 13) + o.price + ' coin</span>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-primary btn-sm" data-act="give">' + icon('check', 16) + 'Berildi</button>' +
        '<button type="button" class="btn btn-red btn-sm" data-act="reject">' + icon('x', 16) + 'Rad</button>' +
      '</div>' +
    '</div>'
  );
  card.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      clearErr(card);
      const action = btn.dataset.act === 'give' ? 'give' : 'reject';
      card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      setBusy(btn, true);
      api('/api/admin/orders/' + o.id, { method: 'POST', body: { action } })
        .then(() => refresh())
        .catch((e) => {
          card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
          setBusy(btn, false);
          if (!e.silent) showErr(card, e.message);
        });
    });
  });
  return card;
}

function openAddItemSheet() {
  const content = el(
    '<div>' +
      '<h3>Yangi sovg’a</h3>' +
      '<div class="field"><label for="g-name">Nomi</label><input id="g-name" type="text" placeholder="Masalan: Kitob" /></div>' +
      '<div class="field"><label for="g-price">Narxi (coin)</label><input id="g-price" type="number" inputmode="numeric" min="1" placeholder="50" /></div>' +
      '<button type="button" class="btn btn-primary btn-block" data-act="save">Qo’shish va e’lon qilish</button>' +
    '</div>'
  );
  const close = openSheet(content);
  const btn = content.querySelector('[data-act="save"]');
  btn.addEventListener('click', () => {
    clearErr(content);
    const name = content.querySelector('#g-name').value.trim();
    const price = parseInt(content.querySelector('#g-price').value, 10);
    if (!name) { showErr(content, 'Nomini kiriting'); return; }
    if (isNaN(price) || price <= 0) { showErr(content, 'Narxni kiriting'); return; }
    setBusy(btn, true);
    api('/api/admin/shop', { method: 'POST', body: { name, price } })
      .then(() => { close(); renderAdminShop(); })
      .catch((e) => { setBusy(btn, false); if (!e.silent) showErr(content, e.message); });
  });
}

/* =========================================================
   ADMIN: INBOX
   ========================================================= */
function renderAdminInbox() {
  Promise.all([
    api('/api/admin/requests'),
    api('/api/admin/submissions'),
    api('/api/admin/shop'),
  ]).then(([requests, submissions, shopData]) => {
    const s = el('<div class="screen"></div>');
    const orders = (shopData && shopData.orders) || [];

    s.appendChild(el(
      '<section class="header-card">' +
        '<div class="hc-date">' + icon('inbox', 15) + '<span>Zapros: ' + requests.length + ' · Topshiriq: ' + submissions.length + ' · Buyurtma: ' + orders.length + '</span></div>' +
        '<div class="hc-title">Inbox</div>' +
      '</section>'
    ));

    /* Zaproslar */
    s.appendChild(el('<h2 class="section-title">Zaproslar</h2>'));
    if (!requests.length) s.appendChild(el('<div class="empty-state">' + icon('users', 32) + '<div>Yangi so’rovlar yo’q</div></div>'));
    requests.forEach((r) => {
      const card = el(
        '<div class="form-card">' +
          '<div class="cc-title" style="font-size:15px">' + esc(r.name) + '</div>' +
          '<div class="cc-sub" style="font-size:13px;color:var(--text-2);margin-top:2px">' +
            esc(r.phone || '') + (r.username ? ' · @' + esc(r.username) : '') +
          '</div>' +
          '<div class="btn-row">' +
            '<button type="button" class="btn btn-primary btn-sm" data-act="student">O’quvchi</button>' +
            '<button type="button" class="btn btn-green-soft btn-sm" data-act="parent">Ota-ona</button>' +
            '<button type="button" class="btn btn-red btn-sm" data-act="reject">Rad</button>' +
          '</div>' +
        '</div>'
      );
      const doAction = (btn, body) => {
        clearErr(card);
        card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        setBusy(btn, true);
        api('/api/admin/requests/' + r.id, { method: 'POST', body })
          .then(() => renderAdminInbox())
          .catch((e) => {
            card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
            setBusy(btn, false);
            if (!e.silent) showErr(card, e.message);
          });
      };
      card.querySelector('[data-act="student"]').addEventListener('click', (e) => doAction(e.currentTarget, { action: 'student' }));
      card.querySelector('[data-act="reject"]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const ok = await askConfirm('«' + r.name + '» so’rovini rad qilasizmi?');
        if (ok) doAction(btn, { action: 'reject' });
      });
      card.querySelector('[data-act="parent"]').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        openStudentPicker((studentId) => doAction(btn, { action: 'parent', studentId }));
      });
      s.appendChild(card);
    });

    /* Topshiriqlar */
    s.appendChild(el('<h2 class="section-title">Topshiriqlar</h2>'));
    if (!submissions.length) s.appendChild(el('<div class="empty-state">' + icon('clipboard', 32) + '<div>Tekshiriladigan topshiriqlar yo’q</div></div>'));
    submissions.forEach((sub) => {
      const isText = sub.contentType === 'text';
      const card = el(
        '<div class="form-card">' +
          '<div class="cc-title" style="font-size:15px">' + esc(sub.taskTitle) + '</div>' +
          '<div class="cc-sub" style="display:flex;gap:8px;align-items:center;font-size:13px;color:var(--text-2);margin-top:2px">' +
            '<span>' + esc(sub.studentName) + '</span>' +
            '<span class="att-stat" style="color:var(--amber)">' + icon('coins', 13) + sub.coinReward + '</span>' +
            '<span>' + esc(fmtDateTime(sub.createdAt)) + '</span>' +
          '</div>' +
          (isText
            ? '<p style="font-size:14px;margin-top:10px;white-space:pre-wrap;word-break:break-word">' + esc(sub.content) + '</p>'
            : '<div class="note">' + icon('alert', 15) + '<span>' + (sub.contentType === 'photo' ? 'Rasm' : 'Fayl') + ' yuborilgan — Botda ko’ring</span></div>') +
          '<div class="btn-row">' +
            '<button type="button" class="btn btn-primary btn-sm" data-act="approve">' + icon('check', 16) + 'Qabul</button>' +
            '<button type="button" class="btn btn-red btn-sm" data-act="reject">' + icon('x', 16) + 'Rad</button>' +
          '</div>' +
        '</div>'
      );
      card.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          clearErr(card);
          card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          setBusy(btn, true);
          api('/api/admin/submissions/' + sub.id, { method: 'POST', body: { action: btn.dataset.act } })
            .then(() => renderAdminInbox())
            .catch((e) => {
              card.querySelectorAll('button').forEach((b) => { b.disabled = false; });
              setBusy(btn, false);
              if (!e.silent) showErr(card, e.message);
            });
        });
      });
      s.appendChild(card);
    });

    /* Buyurtmalar */
    s.appendChild(el('<h2 class="section-title">Buyurtmalar</h2>'));
    if (!orders.length) s.appendChild(el('<div class="empty-state">' + icon('bag', 32) + '<div>Buyurtmalar yo’q</div></div>'));
    orders.forEach((o) => s.appendChild(orderCard(o, renderAdminInbox)));

    mountScreen(s);
  }).catch((e) => { if (!e.silent) screenError(e.message, renderAdminInbox); });
}

function openStudentPicker(onPick) {
  const content = el('<div><h3>Qaysi o’quvchining ota-onasi?</h3><div data-role="list"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div></div></div>');
  const close = openSheet(content);
  const list = content.querySelector('[data-role="list"]');
  api('/api/admin/students').then((all) => {
    clear(list);
    const students = all.filter((st) => !st.hasParent);
    if (!students.length) {
      list.appendChild(el('<div class="empty-state">Ota-onasi biriktirilmagan o’quvchi qolmagan</div>'));
      return;
    }
    students.forEach((st) => {
      const b = el(
        '<button type="button" class="cat-card">' +
          '<div class="cc-icon">' + icon('users', 20) + '</div>' +
          '<div class="cc-body"><div class="cc-title">' + esc(st.name) + '</div></div>' +
          '<div class="cc-right">' + icon('chevron', 20) + '</div>' +
        '</button>'
      );
      b.addEventListener('click', () => { close(); onPick(st.id); });
      list.appendChild(b);
    });
  }).catch((e) => { clear(list); if (!e.silent) showErr(content, e.message); });
}

/* =========================================================
   O'QUVCHI: BOSH
   ========================================================= */
const ATT_LABELS = {
  came: { text: 'Keldi', cls: 'green', icon: 'check' },
  missed_unexcused: { text: 'Kelmadi', cls: 'red', icon: 'x' },
  missed_excused: { text: 'Ogohlantirgan', cls: 'amber', icon: 'alert' },
};

function renderStudentHome() {
  api('/api/me').then((me) => {
    const s = el('<div class="screen"></div>');
    const pay = me.pay || {};

    s.appendChild(el(
      '<section class="header-card">' +
        '<div class="hc-date">' + icon('users', 15) + '<span>Salom, ' + esc(me.name) + '</span></div>' +
        '<div class="hc-coins">' + icon('coins', 30) + '<span>' + (me.coins || 0) + ' coin</span></div>' +
        '<div class="hc-sub">' + icon('clipboard', 15) + '<span>Qoldiq: ' + fmtMoney(pay.remaining || 0) + ' · ' + (pay.lessonsLeft != null ? pay.lessonsLeft : '?') + ' dars</span></div>' +
      '</section>'
    ));

    /* Coin tarixi (timeline) */
    s.appendChild(el('<h2 class="section-title">Coin tarixi</h2>'));
    const history = me.history || [];
    if (!history.length) {
      s.appendChild(el('<div class="empty-state">' + icon('coins', 32) + '<div>Hozircha coin tarixi yo’q</div></div>'));
    } else {
      const tl = el('<div class="timeline"></div>');
      history.forEach((h) => {
        const plus = (h.amount || 0) >= 0;
        tl.appendChild(el(
          '<div class="tl-row">' +
            '<div class="tl-left"><div class="tl-time">' + esc(fmtDate(h.createdAt)) + '</div></div>' +
            '<div class="tl-card" style="display:flex;align-items:center;gap:10px;justify-content:space-between">' +
              '<div class="tl-title" style="min-width:0;overflow:hidden;text-overflow:ellipsis">' + esc(h.reason || '') + '</div>' +
              '<span class="tl-amount ' + (plus ? 'plus' : 'minus') + '">' + (plus ? '+' : '') + h.amount + '</span>' +
            '</div>' +
          '</div>'
        ));
      });
      s.appendChild(tl);
    }

    /* Davomat */
    s.appendChild(el('<h2 class="section-title">Davomat</h2>'));
    const att = me.attendance || [];
    if (!att.length) {
      s.appendChild(el('<div class="empty-state">' + icon('calendar', 32) + '<div>Davomat hali yo’q</div></div>'));
    } else {
      const card = el('<div class="form-card"><div class="detail-list"></div></div>');
      const list = card.querySelector('.detail-list');
      att.forEach((a) => {
        const lb = ATT_LABELS[a.status] || { text: a.status, cls: 'gray', icon: 'alert' };
        list.appendChild(el(
          '<div class="detail-row">' +
            '<span class="dr-label">' + icon('calendar', 15) + esc(fmtDate(a.lessonDate)) + '</span>' +
            '<span class="status-chip ' + lb.cls + '">' + icon(lb.icon, 13) + lb.text + '</span>' +
          '</div>'
        ));
      });
      s.appendChild(card);
    }

    mountScreen(s);
  }).catch((e) => { if (!e.silent) screenError(e.message, renderStudentHome); });
}

/* =========================================================
   O'QUVCHI: VAZIFALAR
   ========================================================= */
const TASK_STATUS = {
  new: { text: 'Yangi', cls: 'green' },
  pending: { text: 'Tekshirilmoqda', cls: 'amber' },
  approved: { text: 'Qabul qilindi', cls: 'green' },
  rejected: { text: 'Rad etildi', cls: 'red' },
  done: { text: 'Bajarildi', cls: 'gray' },
};

function renderStudentTasks() {
  if (state.view && state.view.name === 'quiz') { renderQuizFlow(); return; }
  if (state.view && state.view.name === 'assignment') { renderAssignment(); return; }

  api('/api/tasks').then((tasks) => {
    const s = el('<div class="screen"></div>');
    s.appendChild(el(
      '<section class="header-card">' +
        '<div class="hc-date">' + icon('clipboard', 15) + '<span>Jami: ' + tasks.length + ' ta</span></div>' +
        '<div class="hc-title">Vazifalar</div>' +
      '</section>'
    ));

    if (!tasks.length) {
      s.appendChild(el('<div class="empty-state">' + icon('clipboard', 32) + '<div>Hozircha vazifalar yo’q</div></div>'));
    }

    tasks.forEach((task) => {
      const isQuiz = task.type === 'quiz';
      const st = TASK_STATUS[task.status] || TASK_STATUS.new;
      const openable = task.status === 'new' || task.status === 'rejected';
      const card = el(
        '<button type="button" class="cat-card">' +
          '<div class="cc-icon">' + icon(isQuiz ? 'clipboard' : 'send', 22) + '</div>' +
          '<div class="cc-body">' +
            '<div class="cc-title">' + esc(task.title) + '</div>' +
            '<div class="cc-sub">' +
              '<span>' + (isQuiz ? 'Quiz' : 'Topshiriq') + '</span>' +
              '<span class="att-stat" style="color:var(--amber)">' + icon('coins', 13) + task.coinReward + '</span>' +
              '<span class="status-chip ' + st.cls + '">' + st.text + (task.score ? ' · ' + esc(task.score) : '') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="cc-right">' + (openable ? icon('chevron', 20) : '') + '</div>' +
        '</button>'
      );
      if (openable) {
        card.addEventListener('click', () => {
          if (isQuiz && task.questions && task.questions.length) {
            state.view = { name: 'quiz', data: { task, idx: 0, answers: [] } };
            renderQuizFlow();
          } else if (!isQuiz) {
            state.view = { name: 'assignment', data: { task } };
            renderAssignment();
          }
        });
      } else {
        card.classList.add('static');
      }
      s.appendChild(card);
    });

    mountScreen(s);
  }).catch((e) => { if (!e.silent) screenError(e.message, renderStudentTasks); });
}

function renderQuizFlow() {
  const v = state.view.data;
  const task = v.task;
  const s = el('<div class="screen"></div>');

  const back = el('<button type="button" class="back-btn">' + icon('chevron', 18) + 'Orqaga</button>');
  back.addEventListener('click', () => { state.view = null; renderApp(); });
  s.appendChild(back);

  if (v.result) {
    const r = v.result;
    s.appendChild(el(
      '<div class="result-card">' +
        '<div class="rc-icon">' + icon('check', 32) + '</div>' +
        '<div class="rc-score">' + r.score + '/' + r.total + '</div>' +
        '<div class="rc-sub">To’g’ri javoblar</div>' +
        '<div class="rc-sub" style="margin-top:10px;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--amber);font-weight:600">' +
          icon('coins', 16) + '+' + r.coins + ' coin · Balans: ' + r.balance +
        '</div>' +
      '</div>'
    ));
    const done = el('<button type="button" class="btn btn-primary btn-block" style="margin-top:14px">Vazifalarga qaytish</button>');
    done.addEventListener('click', () => { state.view = null; renderApp(); });
    s.appendChild(done);
    mountScreen(s);
    return;
  }

  const questions = task.questions || [];
  const q = questions[v.idx];

  s.appendChild(el(
    '<section class="header-card">' +
      '<div class="hc-date">' + icon('clipboard', 15) + '<span>' + esc(task.title) + '</span></div>' +
      '<div class="hc-title">' + (v.idx + 1) + '/' + questions.length + '-savol</div>' +
    '</section>'
  ));

  const progress = el('<div class="quiz-progress"></div>');
  questions.forEach((_, i) => {
    progress.appendChild(el('<div class="qp-dot' + (i < v.idx ? ' done' : '') + '"></div>'));
  });
  s.appendChild(progress);

  const qCard = el('<div class="form-card"><h3 style="font-size:17px">' + esc(q.question) + '</h3></div>');
  (q.options || []).forEach((opt, i) => {
    const b = el(
      '<button type="button" class="quiz-option">' +
        '<span class="qo-letter">' + String.fromCharCode(65 + i) + '</span>' +
        '<span>' + esc(opt) + '</span>' +
      '</button>'
    );
    b.addEventListener('click', () => {
      v.answers.push(i);
      if (v.idx + 1 < questions.length) {
        v.idx += 1;
        renderQuizFlow();
      } else {
        qCard.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        api('/api/tasks/' + task.id + '/quiz', { method: 'POST', body: { answers: v.answers } })
          .then((res) => { v.result = res; renderQuizFlow(); })
          .catch((e) => {
            v.answers.pop();
            qCard.querySelectorAll('button').forEach((x) => { x.disabled = false; });
            if (!e.silent) showErr(qCard, e.message);
          });
      }
    });
    qCard.appendChild(b);
  });
  s.appendChild(qCard);

  mountScreen(s);
}

function renderAssignment() {
  const task = state.view.data.task;
  const s = el('<div class="screen"></div>');

  const back = el('<button type="button" class="back-btn">' + icon('chevron', 18) + 'Orqaga</button>');
  back.addEventListener('click', () => { state.view = null; renderApp(); });
  s.appendChild(back);

  s.appendChild(el(
    '<section class="header-card">' +
      '<div class="hc-date">' + icon('send', 15) + '<span>Topshiriq</span></div>' +
      '<div class="hc-title">' + esc(task.title) + '</div>' +
      '<div class="hc-sub">' + icon('coins', 15) + '<span>Mukofot: ' + task.coinReward + ' coin</span></div>' +
    '</section>'
  ));

  const form = el(
    '<div class="form-card">' +
      (task.description ? '<p style="font-size:14px;margin-bottom:14px;white-space:pre-wrap">' + esc(task.description) + '</p>' : '') +
      '<div class="field"><label for="a-text">Javobingiz</label>' +
      '<textarea id="a-text" placeholder="Javob matnini yozing..."></textarea></div>' +
      '<div class="note">' + icon('alert', 15) + '<span>Rasm yoki fayl yubormoqchi bo’lsangiz — botga yuboring.</span></div>' +
      '<button type="button" class="btn btn-primary btn-block" style="margin-top:12px" data-act="send">' + icon('send', 16) + 'Yuborish</button>' +
    '</div>'
  );
  const btn = form.querySelector('[data-act="send"]');
  btn.addEventListener('click', () => {
    clearErr(form);
    const text = form.querySelector('#a-text').value.trim();
    if (!text) { showErr(form, 'Javob matnini kiriting'); return; }
    setBusy(btn, true);
    api('/api/tasks/' + task.id + '/submit', { method: 'POST', body: { text } })
      .then(() => { state.view = null; renderApp(); })
      .catch((e) => { setBusy(btn, false); if (!e.silent) showErr(form, e.message); });
  });
  s.appendChild(form);

  mountScreen(s);
}

/* =========================================================
   O'QUVCHI: SHOP
   ========================================================= */
function renderStudentShop() {
  api('/api/shop').then((data) => {
    const s = el('<div class="screen"></div>');
    const balance = data.balance || 0;
    const items = data.items || [];

    s.appendChild(el(
      '<section class="header-card">' +
        '<div class="hc-date">' + icon('bag', 15) + '<span>Sovg’alar do’koni</span></div>' +
        '<div class="hc-coins">' + icon('coins', 30) + '<span>' + balance + ' coin</span></div>' +
        '<div class="hc-sub">Balansingizga sovg’a tanlang</div>' +
      '</section>'
    ));

    if (!items.length) {
      s.appendChild(el('<div class="empty-state">' + icon('gift', 32) + '<div>Hozircha sovg’alar yo’q</div></div>'));
    }

    items.forEach((it) => {
      const affordable = balance >= it.price;
      const card = el(
        '<div class="cat-card static' + (affordable ? '' : ' locked') + '">' +
          '<div class="cc-icon">' + icon('gift', 22) + '</div>' +
          '<div class="cc-body"><div class="cc-title">' + esc(it.name) + '</div>' +
            '<div class="cc-sub"><span class="att-stat" style="color:var(--amber)">' + icon('coins', 13) + it.price + ' coin</span>' +
            (affordable ? '' : '<span>Coin yetarli emas</span>') + '</div></div>' +
        '</div>'
      );
      const btn = el('<button type="button" class="btn ' + (affordable ? 'btn-primary' : 'btn-ghost') + ' btn-sm"' + (affordable ? '' : ' disabled') + '>Olish</button>');
      if (affordable) {
        btn.addEventListener('click', async () => {
          const ok = await askConfirm('«' + it.name + '» ni ' + it.price + ' coinga sotib olasizmi?');
          if (!ok) return;
          clearErr(card);
          setBusy(btn, true);
          api('/api/shop/' + it.id + '/buy', { method: 'POST', body: {} })
            .then(() => renderStudentShop())
            .catch((e) => { setBusy(btn, false); if (!e.silent) showErr(card, e.message); });
        });
      }
      card.appendChild(btn);
      s.appendChild(card);
    });

    mountScreen(s);
  }).catch((e) => { if (!e.silent) screenError(e.message, renderStudentShop); });
}

/* =========================================================
   OTA-ONA
   ========================================================= */
function renderParent() {
  api('/api/parent').then((data) => {
    const s = el('<div class="screen no-nav"></div>');
    const children = data.children || [];

    s.appendChild(el(
      '<section class="header-card">' +
        '<div class="hc-date">' + icon('users', 15) + '<span>Salom, ' + esc(state.profile.name || '') + '</span></div>' +
        '<div class="hc-title">Farzandlaringiz</div>' +
        '<div class="hc-sub">To’lov va davomat holati</div>' +
      '</section>'
    ));

    if (!children.length) {
      s.appendChild(el('<div class="empty-state">' + icon('users', 32) + '<div>Farzandlar biriktirilmagan</div></div>'));
    }

    children.forEach((ch) => {
      const pay = ch.pay || {};
      const total = pay.lessonsCount || 12;
      const paid = Math.min(pay.chargedCount || 0, total);

      const card = el(
        '<div class="form-card">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
            '<h3 style="margin:0">' + esc(ch.name) + '</h3>' +
            '<span class="status-chip green">' + icon('coins', 14) + (ch.coins != null ? ch.coins : 0) + ' coin</span>' +
          '</div>' +
          '<div class="cc-sub" style="font-size:13px;color:var(--text-2)">To’langan: ' + paid + '/' + total + ' dars</div>' +
          '<div class="pay-grid"></div>' +
          '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">' +
            '<span style="font-size:22px;font-weight:700">' + fmtMoney(pay.remaining || 0) + '</span>' +
            '<span style="font-size:13px;color:var(--text-2)">qoldiq · ' + (pay.lessonsLeft != null ? pay.lessonsLeft : '?') + ' dars</span>' +
          '</div>' +
          '<div class="detail-list" style="margin-top:12px"></div>' +
        '</div>'
      );

      const grid = card.querySelector('.pay-grid');
      for (let i = 0; i < total; i++) {
        grid.appendChild(el('<div class="pay-cell' + (i < paid ? ' paid' : '') + '"></div>'));
      }

      const list = card.querySelector('.detail-list');
      const att = ch.attendance || [];
      if (!att.length) {
        list.appendChild(el('<div class="detail-row"><span class="dr-label">Davomat hali yo’q</span></div>'));
      }
      att.forEach((a) => {
        const lb = ATT_LABELS[a.status] || { text: a.status, cls: 'gray', icon: 'alert' };
        list.appendChild(el(
          '<div class="detail-row">' +
            '<span class="dr-label">' + icon('calendar', 15) + esc(fmtDate(a.lessonDate)) + '</span>' +
            '<span class="status-chip ' + lb.cls + '">' + icon(lb.icon, 13) + lb.text + '</span>' +
          '</div>'
        ));
      });

      s.appendChild(card);
    });

    const old = root.querySelector('.screen, .boot-skeleton');
    if (old) old.replaceWith(s); else root.appendChild(s);
  }).catch((e) => { if (!e.silent) screenError(e.message, renderParent); });
}

/* =========================================================
   BOOT
   ========================================================= */
function boot() {
  if (!tg || !tg.initData) {
    renderGate('telegram');
    return;
  }
  api('/api/profile')
    .then((profile) => {
      state.profile = profile;
      state.tab = 'home';
      state.view = null;
      renderApp();
    })
    .catch((e) => {
      if (e.silent) return;
      clear(root);
      const s = el('<div class="gate"><div class="gate-card"><div class="gate-icon">' + icon('alert', 34) + '</div><h2>Xatolik</h2><p>' + esc(e.message) + '</p></div></div>');
      const retry = el('<button type="button" class="btn btn-primary btn-block" style="margin-top:18px">Qayta urinish</button>');
      retry.addEventListener('click', boot);
      s.querySelector('.gate-card').appendChild(retry);
      root.appendChild(s);
    });
}

boot();

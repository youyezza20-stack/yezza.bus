/* ════════════════════════════════════════════════════════
   app.js — مؤسسة يزه محمد لنقل المسافرين
   ─────────────────────────────────────────────────────
   الوظائف الرئيسية:
   1. إدارة الصفحتين (الجدول / الإحصائيات)
   2. حساب الأسابيع من 15 جوان 2026 → 15 جوان 2027
   3. إدخال وحفظ المداخيل اليومية في LocalStorage
   4. رسم المنحنيات البيانية عبر Chart.js
   ════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════
   §1  CONSTANTS & STATE
   ════════════════════════════════════════════════════════ */

/** تاريخ بداية ونهاية المدة الزمنية */
const START_DATE = new Date(2026, 5, 15);   // 15 جوان 2026  (الشهور: 0-index)
const END_DATE   = new Date(2027, 5, 15);   // 15 جوان 2027

/** مفتاح التخزين في LocalStorage */
const LS_KEY = 'yaza_income_data';

/** أسماء أيام الأسبوع بالعربية (0=أحد، 6=سبت) */
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** الأشهر بالعربية */
const MONTH_NAMES = ['جانفي','فيفري','مارس','أفريل','ماي','جوان','جويلية','أوت','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

/** الحالة الحالية: رقم الأسبوع المعروض (0-indexed) */
let currentWeek = 0;

/** قاعدة بيانات المداخيل: { "2026-06-15": 4500, ... } */
let incomeData = {};

/** كائنات Chart.js (لإتاحة تحديثها لاحقاً) */
let lineChart = null;
let barChart  = null;

/** وضع الرسم البياني: 'weekly' أو 'monthly' */
let chartMode = 'weekly';


/* ════════════════════════════════════════════════════════
   §2  UTILITY FUNCTIONS
   ════════════════════════════════════════════════════════ */

/**
 * تحويل كائن Date إلى نص "YYYY-MM-DD" (مفتاح الحفظ)
 * @param {Date} d
 * @returns {string}
 */
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * تنسيق رقم بالدينار الجزائري
 * @param {number} n
 * @returns {string}
 */
function formatDZD(n) {
  if (!n || isNaN(n)) return '—';
  return n.toLocaleString('fr-DZ') + ' دج';
}

/**
 * تنسيق تاريخ بالعربية "dd شهر"
 * @param {Date} d
 * @returns {string}
 */
function formatDateAr(d) {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/**
 * إضافة عدد من الأيام إلى تاريخ ما (بدون تعديل الأصل)
 * @param {Date} base
 * @param {number} days
 * @returns {Date}
 */
function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * حساب إجمالي الأسابيع بين تاريخين
 * @returns {number}
 */
function totalWeeks() {
  const ms = END_DATE - START_DATE;
  return Math.ceil(ms / (7 * 24 * 3600 * 1000));
}

/**
 * الحصول على تاريخ بداية الأسبوع رقم w
 * @param {number} w - رقم الأسبوع (0-indexed)
 * @returns {Date}
 */
function weekStart(w) {
  return addDays(START_DATE, w * 7);
}


/* ════════════════════════════════════════════════════════
   §3  LOCAL STORAGE — الحفظ والتحميل
   ════════════════════════════════════════════════════════ */

/** تحميل البيانات من LocalStorage عند بدء التطبيق */
function loadData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      incomeData = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('تعذّر تحميل البيانات من الذاكرة المحلية:', e);
    incomeData = {};
  }
}

/** حفظ الحالة الراهنة إلى LocalStorage */
function persistData() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(incomeData));
  } catch (e) {
    console.error('تعذّر الحفظ في الذاكرة المحلية:', e);
  }
}


/* ════════════════════════════════════════════════════════
   §4  PAGE NAVIGATION — التنقل بين الصفحتين
   ════════════════════════════════════════════════════════ */

/**
 * إظهار الصفحة المحددة وإخفاء الأخرى
 * @param {'schedule'|'stats'} name
 */
function showPage(name) {
  // تحديث أزرار الناف
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  // إخفاء كل الصفحات
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // إظهار الصفحة المطلوبة
  document.getElementById('page-' + name).classList.add('active');

  // تحديث الرسوم البيانية عند الانتقال لصفحة الإحصائيات
  if (name === 'stats') {
    updateKPIs();
    renderCharts();
  }
}


/* ════════════════════════════════════════════════════════
   §5  WEEK RENDERING — عرض الأسبوع
   ════════════════════════════════════════════════════════ */

/** رسم الأسبوع الحالي (currentWeek) كاملاً */
function renderWeek() {
  const total = totalWeeks();
  const wStart = weekStart(currentWeek);

  /* ── تحديث رقم الأسبوع وتواريخه ── */
  document.getElementById('week-number').textContent = currentWeek + 1;

  const wEnd = addDays(wStart, 6);
  const rangeText = `${formatDateAr(wStart)} — ${formatDateAr(wEnd)} ${wEnd.getFullYear()}`;
  document.getElementById('week-dates').textContent = rangeText;

  /* ── شريط التقدم السنوي ── */
  const pct = Math.min(100, Math.round((currentWeek / (total - 1)) * 100));
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-pct').textContent = pct + '%';

  /* ── تفعيل/تعطيل أزرار التنقل ── */
  document.getElementById('btn-prev-week').disabled = (currentWeek === 0);
  document.getElementById('btn-next-week').disabled = (currentWeek >= total - 1);

  /* ── بناء بطاقات الأيام ── */
  const grid = document.getElementById('days-grid');
  grid.innerHTML = '';   // مسح القديم

  let weekTotal = 0;
  let weekDaysWithData = 0;

  for (let i = 0; i < 7; i++) {
    const day = addDays(wStart, i);

    // تجاوز الأيام خارج النطاق الزمني
    if (day < START_DATE || day > END_DATE) continue;

    const key   = dateKey(day);
    const value = incomeData[key] || '';

    if (value) {
      weekTotal += parseFloat(value);
      weekDaysWithData++;
    }

    /* إنشاء بطاقة اليوم */
    const card = document.createElement('div');
    card.className = 'day-card' + (value ? ' has-value' : '');
    card.innerHTML = `
      <div class="day-header">
        <div>
          <div class="day-name">${DAY_NAMES[day.getDay()]}</div>
          <div class="day-date">${formatDateAr(day)} ${day.getFullYear()}</div>
        </div>
        <div class="day-badge"></div>
      </div>
      <div class="input-group">
        <input
          class="day-input"
          type="number"
          min="0"
          step="any"
          placeholder="0"
          value="${value}"
          data-key="${key}"
          data-card="${i}"
          inputmode="decimal"
        />
        <span class="currency-tag">دج</span>
      </div>
    `;
    grid.appendChild(card);
  }

  /* ── تحديث الملخص الأسبوعي ── */
  const avg = weekDaysWithData > 0 ? weekTotal / weekDaysWithData : 0;
  document.getElementById('week-total-display').textContent = formatDZD(weekTotal || 0).replace('—', '0 دج');
  document.getElementById('week-avg-display').textContent   = formatDZD(avg || 0).replace('—', '0 دج');

  /* ── ربط أحداث الإدخال للحساب الفوري ── */
  grid.querySelectorAll('.day-input').forEach(input => {
    input.addEventListener('input', onDayInput);
  });

  /* ── تحديث الـ Hero stats ── */
  updateHeroStats();
}

/**
 * حدث: تغيير قيمة حقل إدخال يوم ما
 * → يحدّث الملخص الأسبوعي مباشرة (بدون حفظ حتى الضغط على "حفظ")
 */
function onDayInput(e) {
  const key = e.target.dataset.key;
  const val = parseFloat(e.target.value);

  // تحديث incomeData مؤقتاً
  if (!isNaN(val) && val >= 0) {
    incomeData[key] = val;
    e.target.closest('.day-card').classList.add('has-value');
  } else {
    delete incomeData[key];
    e.target.closest('.day-card').classList.remove('has-value');
  }

  // إعادة حساب الملخص الأسبوعي
  recalcWeekSummary();
}

/** إعادة حساب مجموع ومتوسط الأسبوع الحالي من حقول الإدخال */
function recalcWeekSummary() {
  const inputs = document.querySelectorAll('.day-input');
  let total = 0;
  let count = 0;

  inputs.forEach(inp => {
    const v = parseFloat(inp.value);
    if (!isNaN(v) && v > 0) { total += v; count++; }
  });

  const avg = count > 0 ? total / count : 0;
  document.getElementById('week-total-display').textContent = total.toLocaleString('fr-DZ') + ' دج';
  document.getElementById('week-avg-display').textContent   = avg.toFixed(0).toLocaleString('fr-DZ') + ' دج';
}


/* ════════════════════════════════════════════════════════
   §6  WEEK CHANGE & SAVE
   ════════════════════════════════════════════════════════ */

/**
 * الانتقال للأسبوع التالي أو السابق
 * @param {number} dir — +1 للتالي، -1 للسابق
 */
function changeWeek(dir) {
  const newWeek = currentWeek + dir;
  if (newWeek < 0 || newWeek >= totalWeeks()) return;
  currentWeek = newWeek;
  renderWeek();
}

/** حفظ بيانات الأسبوع الحالي إلى LocalStorage مع إظهار رسالة تأكيد */
function saveWeekData() {
  // قراءة القيم المدخلة حالياً من واجهة المستخدم
  document.querySelectorAll('.day-input').forEach(inp => {
    const key = inp.dataset.key;
    const val = parseFloat(inp.value);
    if (!isNaN(val) && val >= 0) {
      incomeData[key] = val;
    } else {
      delete incomeData[key];
    }
  });

  // الحفظ الفعلي
  persistData();

  // تحديث الـ Hero stats
  updateHeroStats();

  // إظهار رسالة التأكيد (Toast)
  showToast();
}

/** إظهار رسالة "تم الحفظ" لمدة 2 ثانية */
function showToast() {
  const toast = document.getElementById('save-toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}


/* ════════════════════════════════════════════════════════
   §7  HERO STATS BAR — الشريط الإحصائي في الهيرو
   ════════════════════════════════════════════════════════ */

/** تحديث الأرقام في شريط الـ Hero */
function updateHeroStats() {
  const total = Object.values(incomeData).reduce((a, b) => a + parseFloat(b || 0), 0);
  const days  = Object.values(incomeData).filter(v => parseFloat(v) > 0).length;

  // دخل الأسبوع الحالي
  const wStart = weekStart(currentWeek);
  let weekTotal = 0;
  for (let i = 0; i < 7; i++) {
    const k = dateKey(addDays(wStart, i));
    if (incomeData[k]) weekTotal += parseFloat(incomeData[k]);
  }

  document.getElementById('stat-week').textContent  = formatDZD(weekTotal).replace('—', '0 دج');
  document.getElementById('stat-total').textContent = formatDZD(total).replace('—', '0 دج');
  document.getElementById('stat-days').textContent  = days + ' يوم';
}


/* ════════════════════════════════════════════════════════
   §8  STATISTICS PAGE — صفحة الإحصائيات
   ════════════════════════════════════════════════════════ */

/** تحديث بطاقات KPI */
function updateKPIs() {
  const values = Object.values(incomeData).map(v => parseFloat(v)).filter(v => v > 0);
  const total  = values.reduce((a, b) => a + b, 0);
  const days   = values.length;
  const best   = days > 0 ? Math.max(...values) : 0;
  const avg    = days > 0 ? total / days : 0;

  document.getElementById('kpi-total').textContent = formatDZD(total).replace('—', '0 دج');
  document.getElementById('kpi-days').textContent  = days + ' يوم';
  document.getElementById('kpi-best').textContent  = formatDZD(best).replace('—', '—');
  document.getElementById('kpi-avg').textContent   = formatDZD(Math.round(avg)).replace('—', '0 دج');
}

/** رسم/تحديث الرسوم البيانية حسب الوضع الحالي */
function renderCharts() {
  if (chartMode === 'weekly') {
    renderWeeklyCharts();
  } else {
    renderMonthlyCharts();
  }
}

/* ── منحنى الأسابيع ───────────────────────────────────── */
function renderWeeklyCharts() {
  const labels  = [];
  const totals  = [];
  const total   = totalWeeks();

  for (let w = 0; w < total; w++) {
    const ws = weekStart(w);
    let sum = 0;
    let hasData = false;

    for (let d = 0; d < 7; d++) {
      const day = addDays(ws, d);
      const k   = dateKey(day);
      if (incomeData[k]) {
        sum += parseFloat(incomeData[k]);
        hasData = true;
      }
    }

    if (hasData || sum > 0) {
      labels.push(`أ${w + 1}`);
      totals.push(sum);
    }
  }

  document.getElementById('chart-title').textContent = 'منحنى المداخيل الأسبوعية';
  buildLineChart(labels, totals);
  buildBarChart(labels.slice(-12), totals.slice(-12));
}

/* ── منحنى الأشهر ─────────────────────────────────────── */
function renderMonthlyCharts() {
  // تجميع بحسب السنة-الشهر
  const monthMap = {};

  Object.entries(incomeData).forEach(([k, v]) => {
    const d   = new Date(k);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap[key] = (monthMap[key] || 0) + parseFloat(v);
  });

  const sorted = Object.keys(monthMap).sort();
  const labels = sorted.map(k => {
    const [y, m] = k.split('-');
    return MONTH_NAMES[parseInt(m) - 1];
  });
  const totals = sorted.map(k => monthMap[k]);

  document.getElementById('chart-title').textContent = 'منحنى المداخيل الشهرية';
  buildLineChart(labels, totals);
  buildBarChart(labels, totals);
}

/* ── بناء Line Chart ──────────────────────────────────── */
function buildLineChart(labels, data) {
  const ctx = document.getElementById('income-chart').getContext('2d');

  // تدمير الرسم القديم إن وُجد
  if (lineChart) { lineChart.destroy(); lineChart = null; }

  // توليد تدرج خلفي للمنطقة
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0,   'rgba(201,168,76,0.35)');
  gradient.addColorStop(1,   'rgba(201,168,76,0.02)');

  lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'المدخول (دج)',
        data,
        borderColor: '#c9a84c',
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointBackgroundColor: '#c9a84c',
        pointBorderColor: '#0f2744',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          rtl: true,
          textDirection: 'rtl',
          callbacks: {
            label: ctx => ' ' + ctx.parsed.y.toLocaleString('fr-DZ') + ' دج'
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { font: { family: 'Cairo', size: 11 }, color: '#5a6a7e' }
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: {
            font: { family: 'Cairo', size: 11 },
            color: '#5a6a7e',
            callback: v => v.toLocaleString('fr-DZ')
          }
        }
      }
    }
  });
}

/* ── بناء Bar Chart ───────────────────────────────────── */
function buildBarChart(labels, data) {
  const ctx = document.getElementById('bar-chart').getContext('2d');

  if (barChart) { barChart.destroy(); barChart = null; }

  // ألوان: الأكبر قيمة بالذهبي، الباقي بالأزرق
  const max = Math.max(...data);
  const colors = data.map(v => v === max ? '#c9a84c' : 'rgba(15,39,68,0.65)');

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'المدخول (دج)',
        data,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          rtl: true,
          callbacks: {
            label: ctx => ' ' + ctx.parsed.y.toLocaleString('fr-DZ') + ' دج'
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Cairo', size: 11 }, color: '#5a6a7e' }
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: {
            font: { family: 'Cairo', size: 11 },
            color: '#5a6a7e',
            callback: v => v.toLocaleString('fr-DZ')
          }
        }
      }
    }
  });
}

/**
 * التبديل بين وضعَي الرسم البياني (أسبوعي / شهري)
 * @param {'weekly'|'monthly'} mode
 * @param {HTMLElement} btn
 */
function switchChart(mode, btn) {
  chartMode = mode;
  document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderCharts();
}


/* ════════════════════════════════════════════════════════
   §9  INIT — تشغيل التطبيق
   ════════════════════════════════════════════════════════ */

/** نقطة الدخول الرئيسية */
function init() {
  // 1. تحميل البيانات المحفوظة
  loadData();

  // 2. تحديد الأسبوع الحالي تلقائياً بناءً على تاريخ اليوم
  const today = new Date();
  if (today >= START_DATE && today <= END_DATE) {
    const diffMs   = today - START_DATE;
    const diffDays = Math.floor(diffMs / (24 * 3600 * 1000));
    currentWeek = Math.floor(diffDays / 7);
  } else if (today > END_DATE) {
    currentWeek = totalWeeks() - 1;  // آخر أسبوع
  } else {
    currentWeek = 0;  // قبل بداية المدة
  }

  // 3. رسم الأسبوع الأول
  renderWeek();
}

// تشغيل بعد اكتمال تحميل الـ DOM
document.addEventListener('DOMContentLoaded', init);

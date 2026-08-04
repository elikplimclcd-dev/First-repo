// Kiswahili Kwanza — app logic (v4: expanded vocabulary, mobile-friendly, no audio)
// Progress is stored in localStorage so it works fully offline and persists between visits.

const STORAGE_KEY = "kiswahili-kwanza-progress-v3";
const LEGACY_KEY = "kiswahili-kwanza-progress-v2";
const root = document.getElementById("app");

// ---------- progress model ----------
function freshProgress() {
  return { completed: {}, scores: {}, lastVisit: null, streak: 0, xp: 0, perfectCount: 0, badgesSeen: [], itemStats: {}, visitDates: [] };
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(freshProgress(), JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      const p = freshProgress();
      p.completed = old.completed || {};
      p.scores = old.scores || {};
      p.streak = old.streak || 0;
      p.lastVisit = old.lastVisit || null;
      p.xp = Object.keys(p.completed).length * 20;
      return p;
    }
    return freshProgress();
  } catch (e) {
    return freshProgress();
  }
}

function saveProgress(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function isoDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function bumpStreak(p) {
  const today = new Date().toDateString();
  const todayIso = isoDate(new Date());
  if (!p.visitDates) p.visitDates = [];
  if (!p.visitDates.includes(todayIso)) {
    p.visitDates.push(todayIso);
    p.visitDates = p.visitDates.slice(-30);
  }
  if (p.lastVisit === today) return p;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  p.streak = p.lastVisit === yesterday ? (p.streak || 0) + 1 : 1;
  p.lastVisit = today;
  return p;
}

let progress = bumpStreak(loadProgress());
saveProgress(progress);

function lessonById(id) {
  return COURSE.find((l) => l.id === id);
}

// ---------- levels ----------
const LEVELS = [
  { min: 0, title: "Mtoto wa Simba", en: "Lion Cub" },
  { min: 150, title: "Mwanafunzi", en: "Student" },
  { min: 400, title: "Msomi", en: "Scholar" },
  { min: 800, title: "Fundi wa Kiswahili", en: "Swahili Craftsman" },
  { min: 1400, title: "Bingwa", en: "Champion" },
  { min: 2200, title: "Simba Mkuu", en: "Great Lion" },
];

function levelInfo(xp) {
  let current = LEVELS[0];
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].min) { current = LEVELS[i]; idx = i; }
  }
  const next = LEVELS[idx + 1] || null;
  return { current, next, idx };
}

// ---------- badges ----------
const BADGES = [
  { id: "first", icon: "\u{1F389}", title: "Hatua ya Kwanza", en: "First chapter complete", check: (p) => Object.keys(p.completed).length >= 1 },
  { id: "streak7", icon: "\u{1F525}", title: "Wiki Nzima", en: "7-day streak", check: (p) => (p.streak || 0) >= 7 },
  { id: "perfect", icon: "\u2B50", title: "Alama Kamili", en: "A perfect quiz score", check: (p) => (p.perfectCount || 0) >= 1 },
  { id: "quarter", icon: "\u{1F9E9}", title: "Robo ya Safari", en: "14 chapters complete", check: (p) => Object.keys(p.completed).length >= 14 },
  { id: "half", icon: "\u26F0\uFE0F", title: "Nusu ya Safari", en: "28 chapters complete", check: (p) => Object.keys(p.completed).length >= 28 },
  { id: "all", icon: "\u{1F981}", title: "Simba Mkuu", en: "Whole course complete", check: (p) => Object.keys(p.completed).length >= COURSE.length },
];

function earnedBadges(p) {
  return BADGES.filter((b) => b.check(p));
}

// ---------- per-item stats (drives Marudio / spaced review weighting) ----------
function itemKey(lessonId, sw) {
  return lessonId + "|" + sw;
}

function recordItemResult(lessonId, sw, isCorrect) {
  const key = itemKey(lessonId, sw);
  const stats = progress.itemStats[key] || { correct: 0, wrong: 0, lastSeen: null };
  if (isCorrect) stats.correct++; else stats.wrong++;
  stats.lastSeen = Date.now();
  progress.itemStats[key] = stats;
}

function itemWeight(lessonId, sw) {
  const s = progress.itemStats[itemKey(lessonId, sw)];
  if (!s) return 2; // never-seen items still get a fair shot
  return 1 + s.wrong * 3 - Math.min(s.correct, 3) * 0.5;
}

// ---------- typing-answer support ----------
function normalizeSw(s) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[!?.]+$/, "")
    .replace(/\s+/g, " ");
}

function acceptableAnswers(sw) {
  // handle "Mbili / -wili" style alternates — any variant counts as correct
  return sw.split("/").map((s) => normalizeSw(s));
}

function isTypingEligible(item) {
  const sw = item.sw;
  if (sw.includes("(") || sw.includes(")")) return false;
  if (sw.split(" ").length > 3) return false;
  if (sw.length > 24) return false;
  return true;
}

// ---------- confetti (visual only) ----------
function celebrate() {
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  const colors = ["#f5a623", "#e8495f", "#1b8a44", "#141b16", "#ffffff"];
  for (let i = 0; i < 28; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = Math.random() * 0.35 + "s";
    piece.style.animationDuration = 1.5 + Math.random() * 0.9 + "s";
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
}

// ---------- mascot ----------
function mascotSvg(mood) {
  const mouth = mood === "sad" ? "M40,78 Q50,71 60,78" : mood === "big" ? "M36,72 Q50,92 64,72" : "M38,74 Q50,88 62,74";
  const browY = mood === "sad" ? 46 : 44;
  return `
  <svg viewBox="0 0 120 120" class="mascot-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Simba, mascot wa programu">
    <ellipse cx="22" cy="36" rx="17" ry="17" fill="#e8495f"/>
    <ellipse cx="98" cy="36" rx="17" ry="17" fill="#e8495f"/>
    <ellipse cx="22" cy="36" rx="9" ry="9" fill="#f5a623"/>
    <ellipse cx="98" cy="36" rx="9" ry="9" fill="#f5a623"/>
    <circle cx="60" cy="64" r="43" fill="#f5a623"/>
    <ellipse cx="33" cy="76" rx="11" ry="7" fill="#ffffff" opacity="0.85"/>
    <ellipse cx="87" cy="76" rx="11" ry="7" fill="#ffffff" opacity="0.85"/>
    <circle cx="45" cy="${browY + 12}" r="5" fill="#1a1a1a"/>
    <circle cx="75" cy="${browY + 12}" r="5" fill="#1a1a1a"/>
    <ellipse cx="60" cy="68" rx="6" ry="4" fill="#1a1a1a"/>
    <path d="${mouth}" stroke="#1a1a1a" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`;
}

// ---------- progress ring ----------
function progressRing(percent, size) {
  size = size || 104;
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, percent) / 100) * c;
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="progress-ring">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#e3e8e4" stroke-width="9"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#1b8a44" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="55%" text-anchor="middle" class="progress-ring-text">${Math.round(percent)}%</text>
  </svg>`;
}

// ---------- weekly streak calendar (Mon\u2013Sun) ----------
const WEEK_DAYS = [
  { code: "Jtu", full: "Jumatatu", en: "Monday" },
  { code: "Jnn", full: "Jumanne", en: "Tuesday" },
  { code: "Jtn", full: "Jumatano", en: "Wednesday" },
  { code: "Alh", full: "Alhamisi", en: "Thursday" },
  { code: "Iju", full: "Ijumaa", en: "Friday" },
  { code: "Jms", full: "Jumamosi", en: "Saturday" },
  { code: "Jpl", full: "Jumapili", en: "Sunday" },
];

function weekCalendarHtml(visitDates) {
  const visited = new Set(visitDates || []);
  const now = new Date();
  const dayIdx = (now.getDay() + 6) % 7; // convert Sun=0..Sat=6 to Mon=0..Sun=6
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayIdx);

  const days = WEEK_DAYS.map((d, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const iso = isoDate(date);
    const isToday = iso === isoDate(now);
    const isFuture = date > now && !isToday;
    const done = visited.has(iso);
    return `
      <div class="week-day ${done ? "done" : ""} ${isToday ? "today" : ""}" title="${d.full} (${d.en})">
        <span class="week-day-dot">${done ? "\u2713" : ""}</span>
        <span class="week-day-label">${d.code}</span>
      </div>`;
  }).join("");

  return `<div class="week-calendar">${days}</div>`;
}

// ---------- part theming ----------
const PART_THEME = [
  { accent: "#e8495f", icon: "\u{1F5E3}\uFE0F" },
  { accent: "#1b8a44", icon: "\u{1F3DB}\uFE0F" },
  { accent: "#f5a623", icon: "\u{1F9E9}" },
  { accent: "#7c5cbf", icon: "\u{1F91D}" },
  { accent: "#d97706", icon: "\u23F3" },
  { accent: "#0d9488", icon: "\u{1F524}" },
  { accent: "#2563eb", icon: "\u{1F500}" },
  { accent: "#be123c", icon: "\u{1F517}" },
  { accent: "#ca8a04", icon: "\u{1F31F}" },
  { accent: "#6d28d9", icon: "\u{1F4D6}" },
];

// ---------- routing ----------
window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);

function currentRoute() {
  const h = window.location.hash.replace("#", "");
  return h || "home";
}

function render() {
  const route = currentRoute();
  window.scrollTo(0, 0);
  if (route === "home") return renderHome();
  if (route === "resources") return renderResources();
  if (route === "review") return renderReviewIntro();
  if (route === "review-quiz") return renderReviewQuiz();
  if (route === "search") return renderSearch();
  const [kind, lessonId] = route.split("/");
  const lesson = lessonById(lessonId);
  if (!lesson) return renderHome();
  if (kind === "lesson") return renderLesson(lesson);
  if (kind === "quiz") return renderQuiz(lesson);
  renderHome();
}

// ---------- shell ----------
function shell(content, activeNav) {
  const completedCount = Object.keys(progress.completed).length;
  const { current } = levelInfo(progress.xp || 0);
  root.innerHTML = `
    <div class="app-shell">
      <nav class="sidenav">
        <a href="#home" class="brand">
          <span class="brand-mark">KW</span>
          <div>
            <div class="brand-title">Kiswahili Kwanza</div>
            <div class="brand-sub">Sarufi ya Idara \u00b7 based on Mwana Simba</div>
          </div>
        </a>
        <a href="#home" class="nav-link ${activeNav === "home" ? "active" : ""}">Sura Zote <span class="nav-hint">All 79 chapters</span></a>
        <a href="#review" class="nav-link ${activeNav === "review" ? "active" : ""}">Marudio <span class="nav-hint">Spaced review</span></a>
        <a href="#search" class="nav-link ${activeNav === "search" ? "active" : ""}">Tafuta <span class="nav-hint">Search vocab</span></a>
        <a href="#resources" class="nav-link ${activeNav === "resources" ? "active" : ""}">Rasilimali <span class="nav-hint">Extra resources</span></a>

        <div class="level-chip">
          <span class="level-title">${current.title}</span>
          <span class="level-title-en">${current.en}</span>
        </div>

        <div class="nav-stats">
          <div class="stat"><span class="stat-num">${completedCount}/${COURSE.length}</span><span class="stat-label">Sura zimekamilika</span></div>
          <div class="stat"><span class="stat-num streak-flame">${progress.streak || 0}\u{1F525}</span><span class="stat-label">Siku mfululizo</span></div>
        </div>
        <div class="week-calendar-wrap">
          <span class="week-calendar-label">Wiki hii \u00b7 This week</span>
          ${weekCalendarHtml(progress.visitDates)}
        </div>
        <div class="xp-stat"><span class="xp-num">\u2728 ${progress.xp || 0} XP</span></div>

        <button class="reset-btn" id="reset-progress">Anza upya (Reset progress)</button>
        <div class="offline-note">Inafanya kazi bila intaneti mara ikishapakiwa.<br><span>Works offline once loaded. Content adapted from the Mwana Simba Swahili grammar (Root Stem Leaf).</span></div>
      </nav>
      <main class="main-panel">${content}</main>
      <nav class="bottom-tabbar">
        <a href="#home" class="tab-item ${activeNav === "home" ? "active" : ""}">
          <span class="tab-icon">\u{1F4DA}</span><span class="tab-label">Sura</span>
        </a>
        <a href="#review" class="tab-item ${activeNav === "review" ? "active" : ""}">
          <span class="tab-icon">\u{1F501}</span><span class="tab-label">Marudio</span>
        </a>
        <a href="#search" class="tab-item ${activeNav === "search" ? "active" : ""}">
          <span class="tab-icon">\u{1F50D}</span><span class="tab-label">Tafuta</span>
        </a>
        <a href="#resources" class="tab-item ${activeNav === "resources" ? "active" : ""}">
          <span class="tab-icon">\u{1F517}</span><span class="tab-label">Rasilimali</span>
        </a>
      </nav>
    </div>
  `;
  const resetBtn = document.getElementById("reset-progress");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm("Futa maendeleo yote? / Clear all progress?")) {
        progress = freshProgress();
        progress = bumpStreak(progress);
        saveProgress(progress);
        render();
      }
    });
  }
}

// ---------- home ----------
function groupByPart(lessons) {
  const parts = [];
  let current = null;
  lessons.forEach((l) => {
    if (!current || current.part !== l.part) {
      current = { part: l.part, partTitle: l.partTitle, partTitleEn: l.partTitleEn, lessons: [], theme: PART_THEME[parts.length % PART_THEME.length] };
      parts.push(current);
    }
    current.lessons.push(l);
  });
  return parts;
}

function renderHome() {
  const parts = groupByPart(COURSE);
  const completedCount = Object.keys(progress.completed).length;
  const overallPct = (completedCount / COURSE.length) * 100;
  const { current, next } = levelInfo(progress.xp || 0);
  const badges = BADGES.map((b) => ({ ...b, earned: b.check(progress) }));
  const nextLesson = COURSE.find((l) => !progress.completed[l.id]);
  const reviewPoolSize = completedItemPool().length;

  const continueCard = nextLesson ? `
    <a class="feature-card feature-card-gold" href="#lesson/${nextLesson.id}">
      <span class="feature-card-eyebrow">Endelea \u00b7 Continue</span>
      <span class="feature-card-title">${nextLesson.title}</span>
      <span class="feature-card-sub">${nextLesson.subtitle}</span>
      <div class="feature-progress-track"><div class="feature-progress-fill" style="width:${overallPct}%"></div></div>
      <span class="feature-progress-label">${completedCount}/${COURSE.length} sura \u00b7 ${Math.round(overallPct)}%</span>
    </a>` : `
    <a class="feature-card feature-card-gold" href="#home">
      <span class="feature-card-eyebrow">Hongera! \u00b7 Congratulations</span>
      <span class="feature-card-title">Umemaliza sura zote!</span>
      <span class="feature-card-sub">You've completed every chapter. Keep sharp with Marudio.</span>
      <div class="feature-progress-track"><div class="feature-progress-fill" style="width:100%"></div></div>
      <span class="feature-progress-label">${COURSE.length}/${COURSE.length} sura \u00b7 100%</span>
    </a>`;

  const reviewCard = reviewPoolSize >= 6 ? `
    <a class="feature-card feature-card-coral" href="#review">
      <span class="feature-card-eyebrow">Marudio ya Leo \u00b7 Today's Review</span>
      <span class="feature-card-title">Piga marudio ya haraka</span>
      <span class="feature-card-sub">A quick 20-question review pulled from your ${completedCount} completed chapters, weighted toward words you've missed.</span>
      <span class="feature-card-cta">Anza Marudio \u2192</span>
    </a>` : `
    <a class="feature-card feature-card-coral" href="#home">
      <span class="feature-card-eyebrow">Marudio \u00b7 Review</span>
      <span class="feature-card-title">Maliza sura chache kwanza</span>
      <span class="feature-card-sub">Complete a couple of chapters and Marudio will unlock here for spaced review.</span>
    </a>`;

  const badgeRow = badges.map((b) => `
    <div class="badge-chip ${b.earned ? "earned" : "locked"}" title="${b.title} \u2014 ${b.en}">
      <span class="badge-icon">${b.icon}</span>
      <span class="badge-label">${b.title}</span>
    </div>`).join("");

  const sections = parts.map((p, partIdx) => {
    const doneInPart = p.lessons.filter((l) => progress.completed[l.id]).length;
    const cards = p.lessons.map((lesson) => {
      const done = progress.completed[lesson.id];
      const score = progress.scores[lesson.id];
      return `
        <a class="lesson-card ${done ? "done" : ""}" href="#lesson/${lesson.id}" style="--accent:${p.theme.accent}">
          <div class="lesson-num">${String(lesson.number).padStart(2, "0")}</div>
          <div class="lesson-info">
            <div class="lesson-title">${lesson.title}</div>
            <div class="lesson-sub">${lesson.subtitle}</div>
          </div>
          <div class="lesson-status">${done ? `\u2713 ${score}%` : "Anza \u2192"}</div>
        </a>`;
    }).join("");
    return `
      <section class="part-section" style="--accent:${p.theme.accent}">
        <div class="part-header">
          <span class="part-num">${partIdx + 1}</span>
          <h2><span class="part-icon">${p.theme.icon}</span> ${p.part} \u2014 ${p.partTitle}</h2>
          <span class="part-header-en">${p.partTitleEn} \u00b7 ${doneInPart}/${p.lessons.length}</span>
        </div>
        <div class="lesson-grid">${cards}</div>
      </section>`;
  }).join("");

  shell(`
    <header class="hero hero-game">
      <div class="hero-mascot">${mascotSvg("happy")}</div>
      <div class="hero-text">
        <p class="eyebrow">Sarufi Kamili ya Kiswahili \u00b7 Chapters 1\u201379</p>
        <h1>Karibu, mwanafunzi.</h1>
        <p class="hero-copy">Kozi hii imejengwa kutoka kwenye kitabu cha sarufi cha Mwana Simba. Kila sura ina msamiati mwingi, mifano, na jaribio fupi.</p>
        <p class="hero-copy-en">Every chapter has a full vocabulary set, example sentences, and a short quiz. Learn online or offline — progress is saved on your device.</p>
      </div>
      <div class="hero-progress">
        ${progressRing(overallPct)}
        <div class="hero-progress-label">${current.title}${next ? `<span class="hero-progress-next">${next.min - (progress.xp || 0) > 0 ? (next.min - (progress.xp || 0)) + " XP hadi " + next.title : ""}</span>` : "<span class=\"hero-progress-next\">Kiwango cha juu kabisa!</span>"}</div>
      </div>
    </header>

    <section class="feature-cards">
      ${continueCard}
      ${reviewCard}
    </section>

    <section class="badges-row">${badgeRow}</section>

    ${sections}
  `, "home");
}

// ---------- external resources (Rasilimali) ----------
function wikiSearchUrl(name) { return "https://en.wikipedia.org/wiki/Special:Search?search=" + encodeURIComponent(name); }
function ytSearchUrl(name) { return "https://www.youtube.com/results?search_query=" + encodeURIComponent(name); }

const RESOURCES = [
  {
    icon: "\u{1F4DA}", title: "Rasilimali za Jumla", titleEn: "General Kiswahili Resources",
    links: [
      { label: "kiswahili.net", url: "https://www.kiswahili.net" },
      { label: "Kamusi (kamusi.org)", url: "https://kamusi.org" },
      { label: "Glosbe", url: "https://glosbe.com" },
      { label: "Wiktionary", url: "https://en.wiktionary.org" },
      { label: "Omniglot", url: "https://www.omniglot.com" },
      { label: "Learn Swahili", url: "https://learnswahili.org" },
      { label: "SwahiliProf resources", url: "https://swahiliprof.com/swahili-resources/" },
    ],
  },
  {
    icon: "\u{1F393}", title: "Makusanyo ya Vyuo Vikuu", titleEn: "University Resource Collections",
    note: "These university pages link out to many more textbooks, dictionaries, and videos.",
    links: [
      { label: "University of Iowa \u2014 CLCL", url: "https://clcl.uiowa.edu/language-resources/swahili-language-and-culture-resources" },
      { label: "University of Illinois Linguistics", url: "https://linguistics.illinois.edu/languages/swahili/swahili-language-culture-resources" },
      { label: "Iowa French & Italian", url: "https://french-italian.uiowa.edu/areas/swahili/resources" },
      { label: "University of Kansas \u2014 Hujambo", url: "https://olrc.ku.edu/hujambo" },
      { label: "St. Lawrence University", url: "https://www.stlawu.edu/offices/world-languages-cultures-and-media/swahili-resources" },
      { label: "Baylor University", url: "https://imlc.artsandsciences.baylor.edu/student-resources/language-resources/swahili-resources" },
    ],
  },
  {
    icon: "\u{1F4D6}", title: "Sarufi na Kamusi", titleEn: "Grammar & Dictionaries",
    links: [
      { label: "Kamusi.org", url: "https://kamusi.org" },
      { label: "Glosbe", url: "https://glosbe.com" },
      { label: "Wiktionary", url: "https://en.wiktionary.org" },
      { label: "African Languages", url: "https://www.africanlanguages.com" },
      { label: "kiswahili.net", url: "https://www.kiswahili.net" },
    ],
  },
  {
    icon: "\u{1F4D5}", title: "Vitabu na PDF Bila Malipo", titleEn: "Free Textbooks & PDFs",
    links: [
      { label: "Maktaba.org", url: "https://www.maktaba.org" },
      { label: "Kenya Education Cloud (LMS)", url: "https://lms.kec.ac.ke" },
      { label: "Peace Corps", url: "https://peacecorps.gov" },
      { label: "FSI Language Courses", url: "https://fsi-languages.yojik.eu" },
      { label: "Internet Archive", url: "https://archive.org" },
      { label: "Open Library", url: "https://openlibrary.org" },
    ],
  },
  {
    icon: "\u{1F9D2}", title: "Vitabu vya Watoto", titleEn: "Children's Storybooks",
    links: [
      { label: "Storybooks Kiswahili (GitHub)", url: "https://global-asp.github.io/storybooks-swahili/" },
      { label: "African Storybook", url: "https://www.africanstorybook.org" },
      { label: "Maktaba.org", url: "https://www.maktaba.org" },
    ],
  },
  {
    icon: "\u{1F3FA}", title: "Historia ya Kiswahili na Pwani", titleEn: "History of Kiswahili & the Swahili Coast",
    links: [
      { label: "World History Encyclopedia \u2014 Swahili Coast", url: "https://www.worldhistory.org/Swahili_Coast/" },
      { label: "UNESCO World Heritage", url: "https://whc.unesco.org" },
      { label: "National Geographic Education", url: "https://education.nationalgeographic.org" },
      { label: "Britannica", url: "https://www.britannica.com" },
      { label: "Wikipedia \u2014 Swahili culture", url: "https://en.wikipedia.org/wiki/Swahili_culture" },
    ],
  },
  {
    icon: "\u{1F30D}", title: "Makabila Yanayozungumza Kiswahili", titleEn: "Swahili-Region Tribes & Ethnic Groups",
    note: "No fixed links for these \u2014 tap a name to search Wikipedia.",
    generated: ["Swahili", "Mijikenda", "Chaga", "Sukuma", "Nyamwezi", "Haya", "Zaramo", "Gogo", "Hehe", "Makonde", "Maasai", "Sambaa", "Pare", "Taita", "Pokomo", "Yao", "Makua", "Luo", "Kikuyu", "Kamba"],
    genFn: wikiSearchUrl,
  },
  {
    icon: "\u{1F5FA}\uFE0F", title: "Nchi Zinazozungumza Kiswahili", titleEn: "Countries Where Kiswahili is Spoken",
    note: "Tanzania \u00b7 Kenya \u00b7 Uganda \u00b7 Rwanda \u00b7 Burundi \u00b7 DR Congo \u00b7 Comoros \u00b7 northern Mozambique \u00b7 parts of Malawi & Zambia. Tourism boards:",
    links: [
      { label: "Tanzania Tourism", url: "https://www.tanzaniatourism.go.tz" },
      { label: "Tanzania National Parks", url: "https://www.tanzaniaparks.go.tz" },
      { label: "Magical Kenya", url: "https://magicalkenya.com" },
      { label: "Visit Uganda", url: "https://www.visituganda.com" },
      { label: "Visit Rwanda", url: "https://www.visitrwanda.com" },
    ],
  },
  {
    icon: "\u{1F3DB}\uFE0F", title: "Makumbusho", titleEn: "Museums & Cultural Collections",
    links: [
      { label: "British Museum", url: "https://www.britishmuseum.org" },
      { label: "Smithsonian", url: "https://www.si.edu" },
      { label: "The Met", url: "https://www.metmuseum.org" },
      { label: "Google Arts & Culture", url: "https://artsandculture.google.com" },
    ],
  },
  {
    icon: "\u{1F5BC}\uFE0F", title: "Picha Bila Malipo", titleEn: "Free Images",
    links: [
      { label: "Wikimedia Commons", url: "https://commons.wikimedia.org" },
      { label: "Unsplash", url: "https://unsplash.com" },
      { label: "Pexels", url: "https://www.pexels.com" },
      { label: "Pixabay", url: "https://pixabay.com" },
      { label: "Flickr Commons", url: "https://www.flickr.com/commons" },
    ],
  },
  {
    icon: "\u{1F5FA}\uFE0F", title: "Ramani za Kihistoria", titleEn: "Historical Maps",
    links: [
      { label: "Library of Congress Maps", url: "https://www.loc.gov/maps" },
      { label: "David Rumsey Map Collection", url: "https://www.davidrumsey.com" },
    ],
  },
  {
    icon: "\u{1F393}", title: "Majarida ya Kitaaluma", titleEn: "Academic Journals",
    links: [
      { label: "Google Scholar", url: "https://scholar.google.com" },
      { label: "JSTOR", url: "https://www.jstor.org" },
      { label: "ResearchGate", url: "https://www.researchgate.net" },
      { label: "Academia.edu", url: "https://www.academia.edu" },
      { label: "SpringerLink", url: "https://link.springer.com" },
      { label: "Taylor & Francis Online", url: "https://www.tandfonline.com" },
    ],
  },
  {
    icon: "\u{1F4F0}", title: "Habari (Kiingereza)", titleEn: "News (English)",
    links: [
      { label: "BBC Africa", url: "https://www.bbc.com/news/world/africa" },
      { label: "Nation.africa", url: "https://nation.africa" },
      { label: "The Citizen (Tanzania)", url: "https://www.thecitizen.co.tz" },
      { label: "The East African", url: "https://www.theeastafrican.co.ke" },
      { label: "AllAfrica", url: "https://allafrica.com" },
    ],
  },
  {
    icon: "\u{1F4F0}", title: "Habari (Kiswahili)", titleEn: "News (Kiswahili)",
    links: [
      { label: "BBC Swahili", url: "https://www.bbc.com/swahili" },
      { label: "DW Kiswahili", url: "https://www.dw.com/sw" },
      { label: "VOA Swahili", url: "https://www.voaswahili.com" },
      { label: "RFI Kiswahili", url: "https://www.rfi.fr/sw" },
      { label: "IPP Media (Kiswahili)", url: "https://www.ippmedia.com/sw" },
    ],
  },
  {
    icon: "\u{1F4FB}", title: "Redio", titleEn: "Radio",
    links: [
      { label: "VOA Swahili", url: "https://www.voaswahili.com" },
      { label: "BBC Swahili", url: "https://www.bbc.com/swahili" },
      { label: "DW Kiswahili", url: "https://www.dw.com/sw" },
      { label: "Clouds FM", url: "https://www.cloudsfm.co.tz" },
      { label: "Radio Garden", url: "https://radio.garden" },
    ],
  },
  {
    icon: "\u25B6\uFE0F", title: "YouTube", titleEn: "YouTube Channels",
    note: "Channel names \u2014 tap to search YouTube.",
    generated: ["BBC News Swahili", "VOA Swahili", "DW Kiswahili", "Swahili101", "Kiswahili na Abdulkarim", "Language Crush Swahili", "Easy Swahili"],
    genFn: ytSearchUrl,
  },
  {
    icon: "\u{1F3AC}", title: "Filamu na Televisheni", titleEn: "Movies & TV",
    note: "Names \u2014 tap to search YouTube.",
    generated: ["Swahiliwood", "Swahiliflix", "East Africa TV", "Azam TV", "Wasafi TV"],
    genFn: ytSearchUrl,
  },
  {
    icon: "\u{1F3B5}", title: "Muziki", titleEn: "Music",
    note: "Streaming platforms, and genres worth searching for.",
    links: [
      { label: "Boomplay", url: "https://www.boomplay.com" },
      { label: "Spotify", url: "https://www.spotify.com" },
      { label: "Apple Music", url: "https://music.apple.com" },
      { label: "Audiomack", url: "https://audiomack.com" },
    ],
    generated: ["Taarab", "Bongo Flava", "Singeli", "Zilizopendwa", "Gospel Kiswahili"],
    genFn: ytSearchUrl,
  },
  {
    icon: "\u{1F4AC}", title: "Methali na Misemo", titleEn: "Proverbs & Idioms",
    links: [
      { label: "kiswahili.net", url: "https://www.kiswahili.net" },
      { label: "Wikiquote", url: "https://en.wikiquote.org" },
      { label: "Wiktionary", url: "https://en.wiktionary.org" },
    ],
  },
  {
    icon: "\u{1F916}", title: "Rasilimali za AI na NLP", titleEn: "AI & NLP Resources",
    note: "Datasets and tools behind Swahili speech recognition and translation research.",
    links: [
      { label: "Mozilla Common Voice", url: "https://commonvoice.mozilla.org" },
      { label: "Hugging Face", url: "https://huggingface.co" },
      { label: "OPUS", url: "https://opus.nlpl.eu" },
      { label: "Masakhane", url: "https://www.masakhane.io" },
      { label: "Zenodo", url: "https://zenodo.org" },
    ],
  },
  {
    icon: "\u{1F4C2}", title: "Rasilimali Huria za Elimu", titleEn: "Open Educational Resources",
    links: [
      { label: "Maktaba.org", url: "https://www.maktaba.org" },
      { label: "Storybooks Kiswahili", url: "https://global-asp.github.io/storybooks-swahili/" },
      { label: "Kenya Education Cloud", url: "https://lms.kec.ac.ke" },
      { label: "OER Commons", url: "https://www.oercommons.org" },
    ],
  },
];

function renderResources() {
  const cards = RESOURCES.map((cat, i) => {
    const linkItems = (cat.links || []).map((l) => `
      <li><a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label} <span class="ext-arrow">\u2197</span></a></li>`).join("");
    const genItems = cat.generated ? cat.generated.map((name) => `
      <li><a href="${cat.genFn(name)}" target="_blank" rel="noopener noreferrer">${name} <span class="ext-arrow">\u2197</span></a></li>`).join("") : "";
    return `
      <details class="resource-card" ${i < 2 ? "open" : ""}>
        <summary><span class="resource-num">${i + 1}</span><span class="resource-icon">${cat.icon}</span> <span class="resource-title">${cat.title}</span><span class="resource-title-en">${cat.titleEn}</span></summary>
        <div class="resource-body">
          ${cat.note ? `<p class="resource-note">${cat.note}</p>` : ""}
          <ul class="resource-links">${linkItems}${genItems}</ul>
        </div>
      </details>`;
  }).join("");

  shell(`
    <header class="hero">
      <p class="eyebrow">Zaidi ya Kozi \u00b7 Beyond the Course</p>
      <h1>Rasilimali</h1>
      <p class="hero-copy">Viungo vya ziada kwa wanafunzi wanaotaka kwenda mbali zaidi \u2014 kamusi, vitabu, habari, historia, na muziki.</p>
      <p class="hero-copy-en">Extra links for students who want to go further \u2014 dictionaries, textbooks, news, history, and music.</p>
      <p class="resource-disclaimer">\u26A0\uFE0F Viungo hivi vinaelekeza nje ya programu na vinahitaji intaneti; havijahifadhiwa kwa matumizi nje ya mtandao. Vimekusanywa na jamii, hivyo baadhi vinaweza kubadilika \u2014 tafadhali ripoti kiungo kilichovunjika.
      <br><span>These links lead outside the app and need an internet connection; they are not available offline. They're community-curated, so a few may move or go stale over time.</span></p>
    </header>
    <section class="resources-list">${cards}</section>
  `, "resources");
}


// ---------- lesson ----------
function renderLesson(lesson) {
  const vocabCards = lesson.vocab.map((v) => `
    <div class="flip-card" tabindex="0" role="button" aria-label="Geuza kadi">
      <div class="flip-inner">
        <div class="flip-face flip-front"><span>${v.sw}</span></div>
        <div class="flip-face flip-back"><span>${v.en}</span></div>
      </div>
    </div>`).join("");

  const vocabHtml = lesson.vocab.length ? `
    <section class="block">
      <h2>Msamiati na Mifumo <span class="block-en">Vocabulary & patterns</span></h2>
      <p class="block-hint">Gusa kadi kuona tafsiri. <span class="block-hint-en">Tap a card to flip it.</span></p>
      <div class="flip-grid">${vocabCards}</div>
    </section>` : "";

  const sentencesHtml = lesson.sentences.length ? `
    <section class="block">
      <h2>Mifano <span class="block-en">Examples</span></h2>
      <div class="sentence-list">${lesson.sentences.map((s) => `
        <div class="sentence-row">
          <span class="sw">${s.sw}</span>
          <span class="en">${s.en}</span>
        </div>`).join("")}</div>
    </section>` : "";

  const idx = COURSE.findIndex((l) => l.id === lesson.id);
  const prevLesson = COURSE[idx - 1];
  const nextLesson = COURSE[idx + 1];

  shell(`
    <a class="back-link" href="#home">\u2190 Sura Zote</a>
    <header class="lesson-header">
      <p class="eyebrow">${lesson.part} \u00b7 Sura ${String(lesson.number).padStart(2, "0")} / ${COURSE.length}</p>
      <h1>${lesson.title}</h1>
      <p class="hero-copy-en">${lesson.subtitle}</p>
    </header>

    <section class="block">
      <p class="grammar-note">${lesson.note}</p>
    </section>

    ${vocabHtml}

    ${sentencesHtml}

    <div class="lesson-nav-row">
      ${prevLesson ? `<a class="ghost-btn" href="#lesson/${prevLesson.id}">\u2190 ${prevLesson.title}</a>` : "<span></span>"}
      <a class="primary-btn small" href="#quiz/${lesson.id}">Anza Jaribio \u2192</a>
      ${nextLesson ? `<a class="ghost-btn" href="#lesson/${nextLesson.id}">${nextLesson.title} \u2192</a>` : "<span></span>"}
    </div>
  `, "home");

  document.querySelectorAll(".flip-card").forEach((card) => {
    const toggle = () => card.classList.toggle("flipped");
    card.addEventListener("click", toggle);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  });
}

// ---------- global item pool (used for MCQ distractor fallback + search) ----------
let GLOBAL_ITEM_POOL = null;
function getGlobalItemPool() {
  if (!GLOBAL_ITEM_POOL) {
    GLOBAL_ITEM_POOL = [];
    COURSE.forEach((l) => {
      l.vocab.forEach((v) => GLOBAL_ITEM_POOL.push({ sw: v.sw, en: v.en, lessonId: l.id, lessonTitle: l.title, lessonNumber: l.number }));
      l.sentences.forEach((v) => GLOBAL_ITEM_POOL.push({ sw: v.sw, en: v.en, lessonId: l.id, lessonTitle: l.title, lessonNumber: l.number }));
    });
  }
  return GLOBAL_ITEM_POOL;
}

// ---------- quiz generation ----------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Builds a mixed set of MCQ (Swahili \u2192 recognize English) and typing (English \u2192 recall Swahili)
// questions from a pool of {sw, en, lessonId} items. distractorPool supplies MCQ wrong answers.
function buildMixedQuiz(items, distractorPool, typingRatio) {
  typingRatio = typingRatio === undefined ? 0.4 : typingRatio;
  const globalPool = getGlobalItemPool();

  return items.map((item) => {
    const wantsTyping = isTypingEligible(item) && Math.random() < typingRatio;

    if (wantsTyping) {
      return {
        type: "type",
        lessonId: item.lessonId,
        sw: item.sw,
        en: item.en,
        q: item.en,
        qHint: "Andika neno kwa Kiswahili \u2014 type the word in Kiswahili",
      };
    }

    let wrongPool = shuffle(distractorPool.filter((p) => p.en !== item.en));
    const seen = new Set([item.en]);
    let distractors = [];
    for (const p of wrongPool) {
      if (distractors.length >= 3) break;
      if (seen.has(p.en)) continue;
      seen.add(p.en);
      distractors.push(p.en);
    }
    if (distractors.length < 3) {
      for (const p of shuffle(globalPool)) {
        if (distractors.length >= 3) break;
        if (seen.has(p.en)) continue;
        seen.add(p.en);
        distractors.push(p.en);
      }
    }
    const options = shuffle([item.en, ...distractors]);
    return {
      type: "mcq",
      lessonId: item.lessonId,
      sw: item.sw,
      en: item.en,
      q: item.sw,
      qHint: "Chagua tafsiri sahihi \u2014 choose the correct translation",
      options,
      answer: options.indexOf(item.en),
    };
  });
}

// ---------- generic quiz session engine ----------
// Powers both lesson quizzes and Marudio review sessions. `opts.onFinish(pct, correct, total)`
// does the mode-specific wrap-up (marking a lesson complete, showing weak words, etc).
function runQuizSession(quiz, opts) {
  let index = 0;
  let correct = 0;

  function renderQuestion() {
    const q = quiz[index];
    const progressPct = Math.round((index / quiz.length) * 100);
    const inputHtml = q.type === "mcq"
      ? `<div class="options">${q.options.map((opt, i) => `<button class="option-btn" data-i="${i}">${opt}</button>`).join("")}</div>`
      : `
        <input type="text" id="type-answer" class="fill-input-lg" placeholder="Andika kwa Kiswahili..." autocomplete="off" autocapitalize="off" spellcheck="false" />
        <button class="primary-btn small" id="submit-type">Tuma \u2192</button>`;

    root.querySelector(".main-panel").innerHTML = `
      <a class="back-link" href="${opts.backHref}">\u2190 ${opts.backLabel}</a>
      <div class="quiz-progress-track"><div class="quiz-progress-fill" style="width:${progressPct}%"></div></div>
      <p class="eyebrow">Swali ${index + 1} / ${quiz.length}${q.type === "type" ? " \u00b7 \u270D\uFE0F Kumbuka" : ""}</p>
      <p class="quiz-hint">${q.qHint}</p>
      <h2 class="quiz-q">${q.q}</h2>
      <div id="quiz-input-area">${inputHtml}</div>
      <div id="quiz-feedback" class="quiz-feedback"></div>
    `;

    if (q.type === "mcq") {
      root.querySelectorAll(".option-btn").forEach((btn) => {
        btn.addEventListener("click", () => handleAnswer(q, parseInt(btn.dataset.i, 10) === q.answer));
      });
    } else {
      const input = document.getElementById("type-answer");
      const submit = () => {
        const ok = acceptableAnswers(q.sw).includes(normalizeSw(input.value));
        handleAnswer(q, ok);
      };
      document.getElementById("submit-type").addEventListener("click", submit);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      input.focus();
    }
  }

  function handleAnswer(q, isCorrect) {
    if (root.querySelector(".quiz-feedback").innerHTML) return; // already answered
    if (isCorrect) {
      correct++;
      progress.xp = (progress.xp || 0) + 10;
    }
    if (q.lessonId) recordItemResult(q.lessonId, q.sw, isCorrect);
    saveProgress(progress);

    document.querySelectorAll(".option-btn").forEach((b) => (b.disabled = true));
    const input = document.getElementById("type-answer");
    if (input) input.disabled = true;
    const submitBtn = document.getElementById("submit-type");
    if (submitBtn) submitBtn.disabled = true;

    const feedback = document.getElementById("quiz-feedback");
    const correctAnswerText = q.type === "mcq" ? q.options[q.answer] : q.sw;
    feedback.innerHTML = `
      <p class="${isCorrect ? "correct" : "incorrect"}">${isCorrect ? "Sahihi! \u2713 Correct! +10 XP" : `Sio sahihi. Jibu ni: <strong>${correctAnswerText}</strong>`}</p>
      <button class="primary-btn small" id="next-q">${index + 1 < quiz.length ? "Endelea \u2192" : "Maliza \u2192 Finish"}</button>
    `;
    document.getElementById("next-q").addEventListener("click", () => {
      index++;
      if (index >= quiz.length) {
        opts.onFinish(Math.round((correct / quiz.length) * 100), correct, quiz.length);
      } else {
        renderQuestion();
      }
    });
  }

  shell("", opts.activeNav || "home");
  renderQuestion();
}

// Guarantees every exercise has at least `targetCount` questions. Chapters with a large
// vocabulary pool get unique items; small chapters cycle through their pool more than once
// (still varied, since question type and MCQ distractors are re-rolled on each pass).
function selectQuizItems(pool, targetCount) {
  targetCount = targetCount || 20;
  if (pool.length === 0) return [];
  if (pool.length >= targetCount) {
    return shuffle(pool).slice(0, Math.min(pool.length, Math.max(targetCount, 24)));
  }
  let out = [];
  while (out.length < targetCount) {
    out = out.concat(shuffle(pool));
  }
  return out.slice(0, targetCount);
}

// ---------- lesson quiz ----------
function renderQuiz(lesson) {
  const pool = [...lesson.vocab, ...lesson.sentences].map((v) => ({ sw: v.sw, en: v.en, lessonId: lesson.id }));
  const chosen = selectQuizItems(pool, 20);
  const quiz = buildMixedQuiz(chosen, pool, 0.4);

  runQuizSession(quiz, {
    backHref: `#lesson/${lesson.id}`,
    backLabel: lesson.title,
    activeNav: "home",
    onFinish: (pct, correctCount, total) => finishLessonQuiz(lesson, pct),
  });
}

function finishLessonQuiz(lesson, pct) {
  const passed = pct >= 70;
  const alreadyDone = !!progress.completed[lesson.id];
  const badgesBefore = new Set(earnedBadges(progress).map((b) => b.id));

  if (passed && !alreadyDone) progress.xp = (progress.xp || 0) + 20;
  if (passed) progress.completed[lesson.id] = true;
  if (pct === 100) progress.perfectCount = (progress.perfectCount || 0) + 1;
  progress.scores[lesson.id] = pct;

  const badgesAfter = earnedBadges(progress);
  const newBadges = badgesAfter.filter((b) => !badgesBefore.has(b.id));
  progress.badgesSeen = badgesAfter.map((b) => b.id);
  saveProgress(progress);

  if (passed) celebrate();

  const idx = COURSE.findIndex((l) => l.id === lesson.id);
  const nextLesson = COURSE[idx + 1];
  const newBadgeHtml = newBadges.length ? `
    <div class="new-badge-banner">
      <span>Beji Mpya! / New badge${newBadges.length > 1 ? "s" : ""}:</span>
      ${newBadges.map((b) => `<span class="badge-chip earned"><span class="badge-icon">${b.icon}</span><span class="badge-label">${b.title}</span></span>`).join("")}
    </div>` : "";

  root.querySelector(".main-panel").innerHTML = `
    <div class="result-wrap">
      <div class="result-mascot">${mascotSvg(passed ? "big" : "sad")}</div>
      <p class="eyebrow">${lesson.title} \u00b7 Matokeo</p>
      <h1 class="result-score">${pct}%</h1>
      <p class="result-msg">${passed ? "Hongera! Umepita sura hii." : "Karibu! Jaribu tena ili kupita (70%+)."}</p>
      ${passed ? `<p class="result-xp">+${!alreadyDone ? 20 : 0} XP ya ziada kwa kumaliza sura \u00b7 Jumla: ${progress.xp} XP</p>` : ""}
      ${newBadgeHtml}
      <div class="kanga-card">
        <div class="kanga-border"></div>
        <p class="kanga-sw">${lesson.title} \u2014 ${lesson.subtitle}</p>
        <p class="kanga-en">${lesson.note}</p>
        <div class="kanga-border"></div>
      </div>
      <div class="result-actions">
        <a class="ghost-btn" href="#quiz/${lesson.id}">Jaribu Tena / Retry</a>
        ${nextLesson ? `<a class="primary-btn small" href="#lesson/${nextLesson.id}">Sura Ifuatayo \u2192</a>` : `<a class="primary-btn small" href="#home">Sura Zote \u2192</a>`}
      </div>
    </div>
  `;
}

// ---------- Marudio (spaced review) ----------
function completedItemPool() {
  const completedIds = Object.keys(progress.completed);
  const pool = [];
  completedIds.forEach((id) => {
    const lesson = lessonById(id);
    if (!lesson) return;
    [...lesson.vocab, ...lesson.sentences].forEach((v) => pool.push({ sw: v.sw, en: v.en, lessonId: id }));
  });
  return pool;
}

function weightedSample(pool, count) {
  const bag = pool.map((item) => ({ item, weight: itemWeight(item.lessonId, item.sw) }));
  const chosen = [];
  for (let n = 0; n < count && bag.length; n++) {
    const total = bag.reduce((sum, b) => sum + b.weight, 0);
    let r = Math.random() * total;
    let pickIdx = 0;
    for (let i = 0; i < bag.length; i++) {
      r -= bag[i].weight;
      if (r <= 0) { pickIdx = i; break; }
    }
    chosen.push(bag[pickIdx].item);
    bag.splice(pickIdx, 1);
  }
  return chosen;
}

function weakestItems(pool, count) {
  return pool
    .map((item) => ({ item, s: progress.itemStats[itemKey(item.lessonId, item.sw)] }))
    .filter((x) => x.s && x.s.wrong > 0)
    .sort((a, b) => (b.s.wrong - b.s.correct * 0.3) - (a.s.wrong - a.s.correct * 0.3))
    .slice(0, count)
    .map((x) => x.item);
}

function renderReviewIntro() {
  const pool = completedItemPool();
  const completedCount = Object.keys(progress.completed).length;

  if (pool.length < 6) {
    shell(`
      <header class="hero">
        <p class="eyebrow">Marudio \u00b7 Spaced Review</p>
        <h1>Marudio</h1>
        <p class="hero-copy">Bado hujakamilisha sura za kutosha kwa marudio. Maliza angalau sura moja au mbili, kisha rudi hapa.</p>
        <p class="hero-copy-en">You need to complete at least a couple of chapters before there's enough vocabulary here to review. Finish a chapter quiz, then come back.</p>
      </header>
      <a class="primary-btn small" href="#home">Nenda kwenye Sura \u2192</a>
    `, "review");
    return;
  }

  const weak = weakestItems(pool, 6);
  const weakHtml = weak.length ? `
    <section class="block">
      <h2>Maneno ya Kuzingatia <span class="block-en">Words to focus on</span></h2>
      <p class="block-hint">Maneno haya umeyakosea mara kadhaa hapo awali. <span class="block-hint-en">These have tripped you up before.</span></p>
      <div class="weak-word-list">${weak.map((w) => {
        const s = progress.itemStats[itemKey(w.lessonId, w.sw)];
        return `<div class="weak-word"><span class="weak-word-sw">${w.sw}</span><span class="weak-word-en">${w.en}</span><span class="weak-word-count">${s.wrong}\u00d7 wrong</span></div>`;
      }).join("")}</div>
    </section>` : "";

  shell(`
    <header class="hero">
      <p class="eyebrow">Marudio \u00b7 Spaced Review</p>
      <h1>Marudio</h1>
      <p class="hero-copy">Jaribio linalochanganya maneno kutoka kwenye sura ${completedCount} ulizokwisha kamilisha, likizingatia zaidi yale uliyokosea. Hakuna hasara \u2014 lengo ni kukumbuka.</p>
      <p class="hero-copy-en">A quiz mixing vocabulary from your ${completedCount} completed chapters, weighted toward words you've gotten wrong before. No pressure \u2014 this is just for retention.</p>
    </header>
    ${weakHtml}
    <a class="primary-btn small" href="#review-quiz">Anza Marudio \u2192 Start Review</a>
  `, "review");
}

function renderReviewQuiz() {
  const pool = completedItemPool();
  if (pool.length < 6) { navigateHome(); return; }

  const targetCount = 20;
  let chosen;
  if (pool.length >= targetCount) {
    chosen = weightedSample(pool, targetCount);
  } else {
    chosen = [];
    while (chosen.length < targetCount) {
      chosen = chosen.concat(weightedSample(pool, Math.min(pool.length, targetCount - chosen.length)));
    }
  }
  const quiz = buildMixedQuiz(chosen, pool, 0.4);

  runQuizSession(quiz, {
    backHref: "#review",
    backLabel: "Marudio",
    activeNav: "review",
    onFinish: (pct) => finishReviewQuiz(pct),
  });
}

function navigateHome() { window.location.hash = "home"; }

function finishReviewQuiz(pct) {
  progress.xp = (progress.xp || 0) + 15;
  saveProgress(progress);
  celebrate();

  root.querySelector(".main-panel").innerHTML = `
    <div class="result-wrap">
      <div class="result-mascot">${mascotSvg(pct >= 70 ? "big" : "happy")}</div>
      <p class="eyebrow">Marudio \u00b7 Matokeo</p>
      <h1 class="result-score">${pct}%</h1>
      <p class="result-msg">Hongera kwa kufanya marudio! Kila zoezi la marudio linakusaidia kukumbuka kwa muda mrefu.</p>
      <p class="result-xp">+15 XP kwa marudio \u00b7 Jumla: ${progress.xp} XP</p>
      <div class="result-actions">
        <a class="ghost-btn" href="#review-quiz">Marudio Mengine / Another Round</a>
        <a class="primary-btn small" href="#home">Sura Zote \u2192</a>
      </div>
    </div>
  `;
}

// ---------- Tafuta (vocab search) ----------
function renderSearch() {
  shell(`
    <header class="hero">
      <p class="eyebrow">Tafuta \u00b7 Search All Vocabulary</p>
      <h1>Tafuta Neno</h1>
      <p class="hero-copy">Tafuta neno lolote katika sura zote 79 \u2014 Kiswahili au Kiingereza.</p>
      <p class="hero-copy-en">Search any word across all 79 chapters \u2014 in Kiswahili or English.</p>
    </header>
    <input type="text" id="search-input" class="search-input" placeholder="Andika neno... / Type a word..." autocomplete="off" autofocus />
    <div id="search-results" class="search-results"></div>
  `, "search");

  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");
  const pool = getGlobalItemPool();

  function runSearch() {
    const q = normalizeSw(input.value);
    if (q.length < 1) {
      results.innerHTML = `<p class="search-hint">Anza kuandika ili kuona matokeo. \u2014 Start typing to see results.</p>`;
      return;
    }
    const matches = pool.filter((item) =>
      item.sw.toLowerCase().includes(q) || item.en.toLowerCase().includes(q)
    ).slice(0, 60);

    if (!matches.length) {
      results.innerHTML = `<p class="search-hint">Hakuna matokeo kwa "${input.value}". \u2014 No results for "${input.value}".</p>`;
      return;
    }
    results.innerHTML = `
      <p class="search-count">${matches.length} matokeo \u2014 results</p>
      <div class="search-list">
        ${matches.map((m) => `
          <a class="search-row" href="#lesson/${m.lessonId}">
            <span class="search-sw">${m.sw}</span>
            <span class="search-en">${m.en}</span>
            <span class="search-chapter">Sura ${String(m.lessonNumber).padStart(2, "0")} \u00b7 ${m.lessonTitle}</span>
          </a>`).join("")}
      </div>`;
  }

  input.addEventListener("input", runSearch);
  runSearch();
}

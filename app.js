// Kiswahili Kwanza — app logic (v3: audio pronunciation + gamified interface)
// Progress is stored in localStorage so it works fully offline and persists between visits.

const STORAGE_KEY = "kiswahili-kwanza-progress-v3";
const LEGACY_KEY = "kiswahili-kwanza-progress-v2";
const root = document.getElementById("app");

// ---------- progress model ----------
function freshProgress() {
  return { completed: {}, scores: {}, lastVisit: null, streak: 0, xp: 0, perfectCount: 0, badgesSeen: [] };
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

function bumpStreak(p) {
  const today = new Date().toDateString();
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

// ---------- audio (on-device text-to-speech, works offline) ----------
let cachedVoice; // undefined = not yet resolved, null = none found
function pickSwahiliVoice() {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return undefined;
  cachedVoice = voices.find((v) => /^sw/i.test(v.lang)) || null;
  return cachedVoice;
}
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { cachedVoice = pickSwahiliVoice(); };
}

function speak(text) {
  if (!window.speechSynthesis || !text) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.replace(/[\u2014-]/g, " "));
    if (cachedVoice === undefined) cachedVoice = pickSwahiliVoice();
    if (cachedVoice) { utter.voice = cachedVoice; utter.lang = cachedVoice.lang; }
    else { utter.lang = "sw-KE"; }
    utter.rate = 0.85;
    window.speechSynthesis.speak(utter);
  } catch (e) { /* speech not available on this device — silently skip */ }
}

function audioButtonHtml(idx, kind) {
  return `<button class="audio-btn" data-${kind}-idx="${idx}" aria-label="Sikia matamshi" title="Sikia matamshi \u2014 hear pronunciation">\u{1F50A}</button>`;
}

function wireAudioButtons(container, lesson) {
  container.querySelectorAll(".audio-btn[data-vocab-idx]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      speak(lesson.vocab[parseInt(btn.dataset.vocabIdx, 10)].sw);
    });
  });
  container.querySelectorAll(".audio-btn[data-sentence-idx]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      speak(lesson.sentences[parseInt(btn.dataset.sentenceIdx, 10)].sw);
    });
  });
}

// ---------- sound effects (Web Audio API — no files, works offline) ----------
let audioCtx;
function tone(freq, duration, type) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.09, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) { /* audio not available — silently skip */ }
}
function playCorrectSound() { tone(880, 0.12, "sine"); setTimeout(() => tone(1180, 0.16, "sine"), 90); }
function playWrongSound() { tone(180, 0.22, "sawtooth"); }
function playFanfare() { [660, 880, 1108, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.22, "triangle"), i * 110)); }

// ---------- confetti ----------
function celebrate() {
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  const colors = ["#e3a625", "#c1432b", "#1f6f6b", "#16303d", "#f6efe1"];
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
    <ellipse cx="22" cy="36" rx="17" ry="17" fill="#c1432b"/>
    <ellipse cx="98" cy="36" rx="17" ry="17" fill="#c1432b"/>
    <ellipse cx="22" cy="36" rx="9" ry="9" fill="#e3a625"/>
    <ellipse cx="98" cy="36" rx="9" ry="9" fill="#e3a625"/>
    <circle cx="60" cy="64" r="43" fill="#e3a625"/>
    <ellipse cx="33" cy="76" rx="11" ry="7" fill="#f6efe1" opacity="0.75"/>
    <ellipse cx="87" cy="76" rx="11" ry="7" fill="#f6efe1" opacity="0.75"/>
    <circle cx="45" cy="${browY + 12}" r="5" fill="#211f1a"/>
    <circle cx="75" cy="${browY + 12}" r="5" fill="#211f1a"/>
    <ellipse cx="60" cy="68" rx="6" ry="4" fill="#211f1a"/>
    <path d="${mouth}" stroke="#211f1a" stroke-width="3" fill="none" stroke-linecap="round"/>
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
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#ece1cb" stroke-width="9"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#1f6f6b" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="55%" text-anchor="middle" class="progress-ring-text">${Math.round(percent)}%</text>
  </svg>`;
}

// ---------- part theming ----------
const PART_THEME = [
  { accent: "#c1432b", icon: "\u{1F5E3}\uFE0F" },
  { accent: "#1f6f6b", icon: "\u{1F3DB}\uFE0F" },
  { accent: "#e3a625", icon: "\u{1F9E9}" },
  { accent: "#7a4a6b", icon: "\u{1F91D}" },
  { accent: "#a8541f", icon: "\u23F3" },
  { accent: "#3c6e47", icon: "\u{1F524}" },
  { accent: "#2a5f8f", icon: "\u{1F500}" },
  { accent: "#8a2f3a", icon: "\u{1F517}" },
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
        <div class="brand">
          <span class="brand-mark">KW</span>
          <div>
            <div class="brand-title">Kiswahili Kwanza</div>
            <div class="brand-sub">Sarufi ya Idara \u00b7 based on Mwana Simba</div>
          </div>
        </div>
        <a href="#home" class="nav-link ${activeNav === "home" ? "active" : ""}">Sura Zote <span class="nav-hint">All 55 chapters</span></a>

        <div class="level-chip">
          <span class="level-title">${current.title}</span>
          <span class="level-title-en">${current.en}</span>
        </div>

        <div class="nav-stats">
          <div class="stat"><span class="stat-num">${completedCount}/${COURSE.length}</span><span class="stat-label">Sura zimekamilika</span></div>
          <div class="stat"><span class="stat-num streak-flame">${progress.streak || 0}\u{1F525}</span><span class="stat-label">Siku mfululizo</span></div>
        </div>
        <div class="xp-stat"><span class="xp-num">\u2728 ${progress.xp || 0} XP</span></div>

        <button class="reset-btn" id="reset-progress">Anza upya (Reset progress)</button>
        <div class="offline-note">Inafanya kazi bila intaneti mara ikishapakiwa.<br><span>Works offline once loaded. Content adapted from the Mwana Simba Swahili grammar (Root Stem Leaf).</span></div>
      </nav>
      <main class="main-panel">${content}</main>
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

  const badgeRow = badges.map((b) => `
    <div class="badge-chip ${b.earned ? "earned" : "locked"}" title="${b.title} \u2014 ${b.en}">
      <span class="badge-icon">${b.icon}</span>
      <span class="badge-label">${b.title}</span>
    </div>`).join("");

  const sections = parts.map((p) => {
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
        <p class="eyebrow">Sarufi Kamili ya Kiswahili \u00b7 Chapters 1\u201355</p>
        <h1>Karibu, mwanafunzi.</h1>
        <p class="hero-copy">Kozi hii imejengwa kutoka kwenye kitabu cha sarufi cha Mwana Simba. Kila sura ina sauti, msamiati, na jaribio fupi.</p>
        <p class="hero-copy-en">Every chapter has audio pronunciation, vocabulary, and a short quiz. Learn online or offline — progress is saved on your device.</p>
      </div>
      <div class="hero-progress">
        ${progressRing(overallPct)}
        <div class="hero-progress-label">${current.title}${next ? `<span class="hero-progress-next">${current.min ? "" : ""}${next.min - (progress.xp || 0) > 0 ? (next.min - (progress.xp || 0)) + " XP hadi " + next.title : ""}</span>` : "<span class=\"hero-progress-next\">Kiwango cha juu kabisa!</span>"}</div>
      </div>
    </header>

    <section class="badges-row">${badgeRow}</section>

    ${sections}
  `, "home");
}

// ---------- lesson ----------
function renderLesson(lesson) {
  const vocabCards = lesson.vocab.map((v, i) => `
    <div class="flip-card" tabindex="0" role="button" aria-label="Geuza kadi">
      ${audioButtonHtml(i, "vocab")}
      <div class="flip-inner">
        <div class="flip-face flip-front"><span>${v.sw}</span></div>
        <div class="flip-face flip-back"><span>${v.en}</span></div>
      </div>
    </div>`).join("");

  const sentencesHtml = lesson.sentences.length ? `
    <section class="block">
      <h2>Mifano <span class="block-en">Examples</span></h2>
      <div class="sentence-list">${lesson.sentences.map((s, i) => `
        <div class="sentence-row">
          ${audioButtonHtml(i, "sentence")}
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

    <section class="block">
      <h2>Msamiati na Mifumo <span class="block-en">Vocabulary & patterns</span></h2>
      <p class="block-hint">Gusa kadi kuona tafsiri. Bonyeza \u{1F50A} kusikia matamshi. <span class="block-hint-en">Tap a card to flip it, tap \u{1F50A} to hear it.</span></p>
      <div class="flip-grid">${vocabCards}</div>
    </section>

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
  wireAudioButtons(document, lesson);
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

function buildQuiz(lesson) {
  const pool = shuffle([...lesson.vocab, ...lesson.sentences]);
  const count = Math.min(8, Math.max(4, pool.length >= 6 ? 6 : pool.length));
  const chosen = pool.slice(0, count);
  const allAnswers = [...lesson.vocab, ...lesson.sentences].map((p) => p.en);

  return chosen.map((item) => {
    const wrongPool = shuffle(allAnswers.filter((a) => a !== item.en));
    const distractors = wrongPool.slice(0, 3);
    const options = shuffle([item.en, ...distractors]);
    return {
      type: "mcq",
      q: item.sw,
      qHint: "Chagua tafsiri sahihi \u2014 choose the correct translation",
      options,
      answer: options.indexOf(item.en),
    };
  });
}

// ---------- quiz ----------
function renderQuiz(lesson) {
  const quiz = buildQuiz(lesson);
  let index = 0;
  let correct = 0;
  const answers = new Array(quiz.length).fill(null);

  function renderQuestion() {
    const q = quiz[index];
    const progressPct = Math.round((index / quiz.length) * 100);
    const inputHtml = `<div class="options">${q.options.map((opt, i) => `<button class="option-btn" data-i="${i}">${opt}</button>`).join("")}</div>`;

    root.querySelector(".main-panel").innerHTML = `
      <a class="back-link" href="#lesson/${lesson.id}">\u2190 ${lesson.title}</a>
      <div class="quiz-progress-track"><div class="quiz-progress-fill" style="width:${progressPct}%"></div></div>
      <p class="eyebrow">Swali ${index + 1} / ${quiz.length}</p>
      <p class="quiz-hint">${q.qHint}</p>
      <div class="quiz-q-row">
        <h2 class="quiz-q">${q.q}</h2>
        <button class="audio-btn audio-btn-lg" id="quiz-audio-btn" aria-label="Sikia matamshi" title="Sikia matamshi">\u{1F50A}</button>
      </div>
      <div id="quiz-input-area">${inputHtml}</div>
      <div id="quiz-feedback" class="quiz-feedback"></div>
    `;

    document.getElementById("quiz-audio-btn").addEventListener("click", () => speak(q.q));

    root.querySelectorAll(".option-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleAnswer(q, parseInt(btn.dataset.i, 10) === q.answer));
    });
  }

  function handleAnswer(q, isCorrect) {
    if (answers[index] !== null) return;
    answers[index] = isCorrect;
    if (isCorrect) {
      correct++;
      progress.xp = (progress.xp || 0) + 10;
      saveProgress(progress);
      playCorrectSound();
    } else {
      playWrongSound();
    }
    document.querySelectorAll(".option-btn").forEach((b) => (b.disabled = true));

    const feedback = document.getElementById("quiz-feedback");
    feedback.innerHTML = `
      <p class="${isCorrect ? "correct" : "incorrect"}">${isCorrect ? "Sahihi! \u2713 Correct! +10 XP" : `Sio sahihi. Jibu ni: <strong>${q.options[q.answer]}</strong>`}</p>
      <button class="primary-btn small" id="next-q">${index + 1 < quiz.length ? "Endelea \u2192" : "Maliza \u2192 Finish"}</button>
    `;
    document.getElementById("next-q").addEventListener("click", () => {
      index++;
      if (index >= quiz.length) {
        finishQuiz();
      } else {
        renderQuestion();
      }
    });
  }

  function finishQuiz() {
    const pct = Math.round((correct / quiz.length) * 100);
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

    if (passed) { celebrate(); playFanfare(); }

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

  shell("", "home");
  renderQuestion();
}

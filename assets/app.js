/* ===== 心晴小星球 · 互動邏輯 ===== */
(function () {
  "use strict";

  /* ---------- 狀態 ---------- */
  const KEY = "mindfulP3.v1";
  const DEFAULT_STATE = {
    stars: 0,
    sessions: 0,
    bestCycles: 0,
    totalCycles: 0,
    scanDone: false,
    bubbleBest: 0,
    memoryDone: false,
    gratitude: {},
    mindFlipped: [],
    sound: true,
    voice: true,
  };

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT_STATE };
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULT_STATE };
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* 私密模式或空間不足時忽略 */
    }
  }
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function todayKey(d) {
    const t = d || new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }

  /* ---------- 音效 ---------- */
  let audioCtx = null;
  function chime(freq, dur) {
    if (!state.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = freq || 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (dur || 0.5));
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + (dur || 0.5) + 0.05);
    } catch (e) {
      /* 忽略 */
    }
  }
  function popSound() {
    chime(660, 0.16);
  }

  /* ---------- 語音 ---------- */
  const synth = window.speechSynthesis || null;
  let zhVoice = null;
  function pickVoice() {
    if (!synth) return;
    const vs = synth.getVoices() || [];
    zhVoice =
      vs.find((v) => /zh[-_]?HK/i.test(v.lang)) ||
      vs.find((v) => /yue/i.test(v.lang)) ||
      vs.find((v) => /zh[-_]?(TW|Hant)/i.test(v.lang)) ||
      vs.find((v) => /^zh/i.test(v.lang)) ||
      null;
  }
  if (synth) {
    pickVoice();
    synth.onvoiceschanged = pickVoice;
  }
  function speak(text, opts) {
    if (!state.voice || !synth) {
      // 語音關閉時，仍然按文字長度預留閱讀時間，避免「自動導航」衝得太快
      if (opts && opts.onend) {
        const wait = clamp(1500 + String(text).length * 260, 2000, 14000);
        setTimeout(opts.onend, wait);
      }
      return;
    }
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = zhVoice ? zhVoice.lang : "zh-HK";
      if (zhVoice) u.voice = zhVoice;
      u.rate = (opts && opts.rate) || 0.92;
      u.pitch = 1.06;
      if (opts && opts.onend) u.onend = opts.onend;
      synth.speak(u);
    } catch (e) {
      if (opts && opts.onend) opts.onend();
    }
  }
  function stopSpeak() {
    if (synth) {
      try { synth.cancel(); } catch (e) {}
    }
  }

  /* ---------- 星星 / 提示 ---------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }
  function addStars(n, msg) {
    state.stars += n;
    save();
    updateHUD();
    chime(1046, 0.35);
    if (msg) toast(msg);
  }

  /* ---------- 徽章 ---------- */
  const BADGES = [
    { id: "breath1", icon: "🌬️", name: "呼吸小新手", desc: "完成 1 次呼吸練習", test: (s) => s.sessions >= 1 },
    { id: "breath3", icon: "🌈", name: "彩虹呼吸達人", desc: "完成 3 次呼吸練習", test: (s) => s.sessions >= 3 },
    { id: "scan", icon: "🧘", name: "身體探險家", desc: "完成 1 次身體掃描", test: (s) => !!s.scanDone },
    { id: "bubble", icon: "🎯", name: "專注小超人", desc: "泡泡遊戲達 20 分", test: (s) => s.bubbleBest >= 20 },
    { id: "memory", icon: "🃏", name: "記憶大師", desc: "完成記憶配對", test: (s) => !!s.memoryDone },
    { id: "grat3", icon: "💛", name: "感恩小天使", desc: "寫 3 日感恩日記", test: (s) => Object.keys(s.gratitude || {}).length >= 3 },
    { id: "mind8", icon: "🌱", name: "正向小勇士", desc: "翻開 8 張正向卡", test: (s) => (s.mindFlipped || []).length >= 8 },
    { id: "star20", icon: "⭐", name: "星星收集家", desc: "儲到 20 粒星星", test: (s) => s.stars >= 20 },
  ];

  function checkBadges(silent) {
    const unlocked = BADGES.filter((b) => b.test(state));
    unlocked.forEach((b) => {
      if (!state["badge_" + b.id]) {
        state["badge_" + b.id] = true;
        if (!silent) {
          setTimeout(() => toast(`🏅 新徽章：${b.name}！`), 700);
          chime(1318, 0.5);
        }
      }
    });
    save();
  }

  function updateHUD() {
    $("#starCount").textContent = state.stars;
    $("#awardStars").textContent = state.stars;
    const unlockedCount = BADGES.filter((b) => b.test(state)).length;
    $("#awardBadges").textContent = unlockedCount;
    renderBadges();
    // 呼吸統計
    $("#breathSessions").textContent = state.sessions;
    $("#breathSessionBest").textContent = state.bestCycles;
  }

  function renderBadges() {
    const grid = $("#badgeGrid");
    grid.innerHTML = "";
    BADGES.forEach((b) => {
      const on = b.test(state);
      const div = document.createElement("div");
      div.className = "badge" + (on ? " unlocked" : "");
      div.innerHTML = `<span class="bicon">${b.icon}</span><span class="bname">${b.name}</span><span class="bdesc">${on ? "已獲得" : b.desc}</span>`;
      grid.appendChild(div);
    });
  }

  /* ---------- 導航 ---------- */
  const VIEWS = ["home", "breathe", "body", "focus", "gratitude", "mindset", "videos", "awards"];
  function go(name, skipHash) {
    if (!VIEWS.includes(name)) name = "home";
    if (name !== "breathe") stopBreathing(true);
    if (name !== "mindset") stopMini();
    stopSpeak();
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + name));
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.nav === name));
    if (!skipHash) {
      try { history.replaceState(null, "", "#" + name); } catch (e) {}
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  window.addEventListener("hashchange", () => {
    const h = (location.hash || "").replace("#", "");
    if (VIEWS.includes(h)) go(h, true);
  });

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-nav]");
    if (el) {
      e.preventDefault();
      go(el.dataset.nav);
    }
  });

  /* ---------- 開關 ---------- */
  $("#soundBtn").addEventListener("click", () => {
    state.sound = !state.sound;
    save();
    $("#soundBtn").setAttribute("aria-pressed", String(state.sound));
    $("#soundBtn").textContent = state.sound ? "🔔" : "🔕";
    if (state.sound) chime(880, 0.3);
  });
  $("#voiceBtn").addEventListener("click", () => {
    state.voice = !state.voice;
    save();
    $("#voiceBtn").setAttribute("aria-pressed", String(state.voice));
    $("#voiceBtn").textContent = state.voice ? "🗣️" : "🤐";
    if (!state.voice) stopSpeak();
    else speak("語音導航已開啟");
  });

  /* ---------- 金句 ---------- */
  const QUOTES = [
    "「慢慢呼一口氣，你就會發現，心入面有個好安靜嘅地方。」",
    "「你唔需要完美，你只需要今日比昨日勇敢少少。」",
    "「心情好似天氣，落雨之後，太陽會再出嚟。」",
    "「做唔到，只係代表你仲喺學習嘅路上。」",
    "「停一停，望下身邊，你會發現好多小美好。」",
    "「你嘅努力，就算無人見到，都係真實存在嘅。」",
    "「犯錯唔緊要，最重要係你願意再試一次。」",
    "「當你慢慢呼吸，你就係自己最好嘅朋友。」",
  ];
  let lastQuote = -1;
  function newQuote() {
    let i = lastQuote;
    while (i === lastQuote) i = Math.floor(Math.random() * QUOTES.length);
    lastQuote = i;
    $("#dailyQuote").textContent = QUOTES[i];
  }
  $("#newQuoteBtn").addEventListener("click", newQuote);

  /* ---------- 彩虹呼吸 ---------- */
  const PATTERN = [
    { key: "in", label: "吸氣", secs: 4, cls: "phase-in" },
    { key: "hold", label: "停一停", secs: 2, cls: "phase-hold" },
    { key: "out", label: "呼氣", secs: 6, cls: "phase-out" },
  ];
  const TARGET_CYCLES = 5;
  const breath = { running: false, phase: 0, elapsed: 0, last: 0, cycles: 0, raf: 0 };
  const ball = $("#breatheBall");
  const phaseLabel = $("#breathePhase");
  const countLabel = $("#breatheCount");
  const hint = $("#breatheHint");

  function setScale(v) {
    ball.style.transform = `scale(${v.toFixed(3)})`;
  }
  function paintPhase() {
    const p = PATTERN[breath.phase];
    phaseLabel.textContent = p.label;
    ball.className = "breathe-ball " + p.cls;
  }
  function tick(now) {
    if (!breath.running) return;
    if (!breath.last) breath.last = now;
    const dt = Math.min(0.05, (now - breath.last) / 1000);
    breath.last = now;
    breath.elapsed += dt;
    const p = PATTERN[breath.phase];
    const t = clamp(breath.elapsed / p.secs, 0, 1);
    if (p.key === "in") setScale(0.62 + 0.38 * ease(t));
    else if (p.key === "hold") setScale(1);
    else setScale(1 - 0.38 * ease(t));
    countLabel.textContent = Math.max(1, Math.ceil(p.secs - breath.elapsed));

    if (breath.elapsed >= p.secs) {
      breath.elapsed = 0;
      breath.phase = (breath.phase + 1) % PATTERN.length;
      if (breath.phase === 0) {
        breath.cycles++;
        $("#breathCycles").textContent = breath.cycles;
        chime(523, 0.2);
        if (breath.cycles >= TARGET_CYCLES) {
          finishBreathing();
          return;
        }
      }
      paintPhase();
      speak(PATTERN[breath.phase].label, { rate: 0.85 });
    }
    breath.raf = setInterval(() => tick(performance.now()), 40);
  }
  function ease(t) {
    return t * t * (3 - 2 * t);
  }

  function startBreathing() {
    if (breath.running) return;
    breath.running = true;
    breath.phase = 0;
    breath.elapsed = 0;
    breath.last = 0;
    breath.cycles = 0;
    $("#breathCycles").textContent = "0";
    $("#breathStart").disabled = true;
    $("#breathStop").disabled = false;
    hint.textContent = "用鼻吸氣，個波波會長大…";
    paintPhase();
    setScale(0.62);
    speak("準備，慢慢吸氣", { rate: 0.85 });
    breath.raf = setInterval(() => tick(performance.now()), 40);
  }
  function finishBreathing() {
    breath.running = false;
    clearInterval(breath.raf);
    phaseLabel.textContent = "完成";
    countLabel.textContent = "🎉";
    setScale(0.9);
    ball.className = "breathe-ball phase-in";
    hint.innerHTML = "好叻呀！你完成咗 5 個循環。感受一下，心入面係咪靜咗少少？";
    $("#breathStart").disabled = false;
    $("#breathStop").disabled = true;
    state.sessions++;
    state.bestCycles = Math.max(state.bestCycles, breath.cycles);
    state.totalCycles += breath.cycles;
    save();
    addStars(1, "⭐ +1　完成 5 個呼吸循環！");
    checkBadges();
    updateHUD();
    speak("好叻，你完成咗五個循環。感受一下，心入面係咪靜咗少少。", { rate: 0.9 });
    chime(1318, 0.6);
  }
  function stopBreathing(silent) {
    if (!breath.running) {
      if (!silent) {
        $("#breathStart").disabled = false;
        $("#breathStop").disabled = true;
      }
      clearInterval(breath.raf);
      return;
    }
    breath.running = false;
    clearInterval(breath.raf);
    stopSpeak();
    $("#breathStart").disabled = false;
    $("#breathStop").disabled = true;
    phaseLabel.textContent = "準備";
    countLabel.textContent = "🌈";
    setScale(0.62);
    hint.textContent = "隨時可以再開始。每次做 5 個循環就夠喇。";
    if (!silent) chime(440, 0.25);
  }
  $("#breathStart").addEventListener("click", startBreathing);
  $("#breathStop").addEventListener("click", () => stopBreathing(false));

  /* ---------- 一分鐘急救呼吸 ---------- */
  const mini = { timer: null, phase: 0, left: 4, breaths: 0, running: false };
  const miniEl = $("#miniDisplay");
  function miniPaint() {
    const isIn = mini.phase === 0;
    miniEl.innerHTML = `${isIn ? "吸氣" : "呼氣"} <span style="opacity:.6">${mini.left}</span>`;
  }
  function startMini() {
    if (mini.running) return;
    stopSpeak();
    mini.running = true;
    mini.phase = 0;
    mini.left = 4;
    mini.breaths = 0;
    $("#miniStart").textContent = "停止";
    miniPaint();
    mini.timer = setInterval(() => {
      mini.left--;
      if (mini.left <= 0) {
        if (mini.phase === 0) {
          mini.phase = 1;
          mini.left = 6;
        } else {
          mini.phase = 0;
          mini.left = 4;
          mini.breaths++;
          chime(660, 0.15);
          if (mini.breaths >= 6) {
            stopMini();
            miniEl.textContent = "完成 🎉 你做得好好！";
            addStars(1, "⭐ +1　一分鐘呼吸完成！");
            checkBadges();
            speak("完成，你做得好好。");
            return;
          }
        }
      }
      miniPaint();
    }, 1000);
  }
  function stopMini() {
    clearInterval(mini.timer);
    mini.running = false;
    const btn = $("#miniStart");
    if (btn) btn.textContent = "開始一分鐘";
  }
  $("#miniStart").addEventListener("click", () => {
    if (mini.running) {
      stopMini();
      miniEl.textContent = "準備";
    } else startMini();
  });

  /* ---------- 以下：身體掃描 / 遊戲 / 感恩 / 正向卡 / 影片 ---------- */

  /* ---------- 身體掃描 ---------- */
  const SCAN = [
    {
      emoji: "🙂",
      title: "坐好，準備",
      text: "坐得舒服啲，雙腳踩實地下，雙手放喺大脾。慢慢吸一口氣，然後慢慢呼氣。準備同自己嘅身體打個招呼。",
    },
    {
      emoji: "🧠",
      title: "頭同面",
      text: "將注意力放喺塊面。留意額頭有冇拉緊？眼皮放鬆未？下巴鬆開，嘴唇微微分開。如果面仔有少少痕，唔需要抓，只係留意下佢。",
    },
    {
      emoji: "💪",
      title: "肩同頸",
      text: "留意兩個膊頭。慢慢將膊頭升起，吸氣；然後呼氣，放低。再做一次。感覺膊頭好似卸下一袋書咁輕鬆。",
    },
    {
      emoji: "🤲",
      title: "雙手",
      text: "感受雙手。手指有冇暖暖嘅感覺？試下輕輕握拳三秒，然後放開，感受手掌慢慢鬆開嘅感覺。",
    },
    {
      emoji: "💨",
      title: "肚同胸",
      text: "將手放喺肚上面。吸氣嘅時候，感覺肚皮慢慢脹起；呼氣嘅時候，肚皮慢慢凹入。唔需要用力，只係跟住呼吸走。",
    },
    {
      emoji: "🦶",
      title: "雙腳",
      text: "感受腳板同地下接觸嘅地方。腳趾輕輕動一動，再放鬆。由大腿到腳趾，慢慢變得暖暖、重重。",
    },
    {
      emoji: "✨",
      title: "多謝身體",
      text: "最後，感受整個身體坐喺度。心入面同身體講：「多謝你今日陪我返學、跑跑跳跳。」慢慢張開眼睛，望一望四周。",
    },
  ];
  let scanIdx = 0;
  let scanAuto = false;
  let scanTimer = null;

  function renderScan() {
    const s = SCAN[scanIdx];
    const card = $("#scanCard");
    card.classList.add("swap");
    setTimeout(() => {
      $("#scanEmoji").textContent = s.emoji;
      $("#scanTitle").textContent = s.title;
      $("#scanText").textContent = s.text;
      card.classList.remove("swap");
    }, 160);
    $("#scanStepLabel").textContent = `第 ${scanIdx + 1} / ${SCAN.length} 步`;
    $("#scanBar").style.width = `${((scanIdx + 1) / SCAN.length) * 100}%`;
    $("#scanPrev").disabled = scanIdx === 0;
    const isLast = scanIdx === SCAN.length - 1;
    $("#scanNext").textContent = isLast ? "完成 ✓" : "下一步 →";
    $("#scanPlay").textContent = scanAuto ? "⏸ 暫停導航" : "🔊 聽住做";
  }

  function readScan() {
    const s = SCAN[scanIdx];
    const isLast = scanIdx === SCAN.length - 1;
    speak(`${s.title}。${s.text}`, {
      rate: 0.88,
      onend: () => {
        if (!scanAuto) return;
        if (isLast) {
          finishScan();
          return;
        }
        scanTimer = setTimeout(() => {
          scanIdx++;
          renderScan();
          readScan();
        }, 1200);
      },
    });
    if (isLast) $("#scanNote").textContent = "做完之後，可以同老師講下你嘅感覺。";
  }

  function finishScan() {
    scanAuto = false;
    stopSpeak();
    $("#scanNote").textContent = "🎉 你完成咗一次身體掃描！";
    if (!state.scanDone) {
      state.scanDone = true;
      save();
      addStars(2, "⭐ +2　完成身體掃描！");
      checkBadges();
      updateHUD();
    } else {
      toast("🎉 又完成一次身體掃描！");
    }
    $("#scanPlay").textContent = "🔊 聽住做";
    chime(1318, 0.5);
  }

  $("#scanPrev").addEventListener("click", () => {
    if (scanIdx > 0) {
      stopSpeak();
      clearTimeout(scanTimer);
      scanIdx--;
      renderScan();
      if (scanAuto) readScan();
    }
  });
  $("#scanNext").addEventListener("click", () => {
    stopSpeak();
    clearTimeout(scanTimer);
    if (scanIdx < SCAN.length - 1) {
      scanIdx++;
      renderScan();
      if (scanAuto) readScan();
    } else {
      finishScan();
    }
  });
  $("#scanPlay").addEventListener("click", () => {
    scanAuto = !scanAuto;
    if (scanAuto) {
      readScan();
    } else {
      stopSpeak();
      clearTimeout(scanTimer);
    }
    renderScan();
  });

  /* ---------- 靜心泡泡 ---------- */
  const arena = $("#bubbleArena");
  const bubble = { running: false, score: 0, left: 30, spawner: 0, timer: 0 };
  const arenaHint = $("#arenaHint");

  function spawnBubble() {
    if (!bubble.running) return;
    if (arena.querySelectorAll(".bubble").length >= 9) return;
    const w = arena.clientWidth;
    const h = arena.clientHeight;
    const size = 44 + Math.random() * 34;
    const b = document.createElement("div");
    b.className = "bubble";
    b.style.width = b.style.height = size + "px";
    b.style.left = Math.random() * (w - size) + "px";
    b.style.top = Math.random() * (h - size) + "px";
    b.innerHTML = Math.random() > 0.75 ? "✨" : "";
    arena.appendChild(b);
    setTimeout(() => {
      if (b.parentNode && !b.dataset.dead) {
        b.dataset.dead = "1";
        b.classList.add("burst");
        setTimeout(() => b.remove(), 320);
      }
    }, 2600);
  }

  function startBubbles() {
    if (bubble.running) return;
    bubble.running = true;
    bubble.score = 0;
    bubble.left = 30;
    arena.innerHTML = "";
    $("#bubbleScore").textContent = "0";
    $("#bubbleTime").textContent = "30";
    $("#bubbleStart").disabled = true;
    $("#bubbleStart").textContent = "進行中…";
    spawnBubble();
    bubble.spawner = setInterval(spawnBubble, 720);
    bubble.timer = setInterval(() => {
      bubble.left--;
      $("#bubbleTime").textContent = bubble.left;
      if (bubble.left <= 0) endBubbles();
    }, 1000);
    chime(880, 0.2);
  }

  function endBubbles() {
    bubble.running = false;
    clearInterval(bubble.spawner);
    clearInterval(bubble.timer);
    arena.querySelectorAll(".bubble").forEach((b) => {
      b.dataset.dead = "1";
      b.classList.add("burst");
      setTimeout(() => b.remove(), 320);
    });
    const score = bubble.score;
    state.bubbleBest = Math.max(state.bubbleBest, score);
    save();
    $("#bubbleStart").disabled = false;
    $("#bubbleStart").textContent = "▶ 再玩一次";
    const box = document.createElement("div");
    box.className = "arena-result";
    box.innerHTML = `<p class="arena-score">${score}</p><p>個泡泡！</p>`;
    box.style.cssText =
      "position:absolute;inset:0;display:grid;place-content:center;text-align:center;background:rgba(255,255,255,.88);font-weight:800;color:#26324a;z-index:2";
    const num = box.querySelector(".arena-score");
    num.style.cssText = "font-family:'Baloo 2',sans-serif;font-size:64px;line-height:1;color:#3b5bdb;margin:0";
    arena.appendChild(box);
    if (score >= 20) {
      addStars(2, "⭐ +2　專注力超強！");
      speak(`好犀利！你戳破咗 ${score} 個泡泡，好專注呀。`);
    } else if (score >= 10) {
      addStars(1, "⭐ +1　做得好！");
      speak(`你戳破咗 ${score} 個泡泡，做得唔錯。`);
    } else {
      toast("慢慢嚟，下次會更好！");
      speak("慢慢嚟，下次會更好。試下望清楚先戳。");
    }
    checkBadges();
    updateHUD();
  }

  arena.addEventListener(
    "pointerdown",
    (e) => {
      const b = e.target.closest(".bubble");
      if (!b || !bubble.running || b.dataset.dead) return;
      b.dataset.dead = "1";
      bubble.score++;
      $("#bubbleScore").textContent = bubble.score;
      popSound();
      b.classList.add("burst");
      setTimeout(() => b.remove(), 320);
    },
    { passive: true }
  );

  $("#bubbleStart").addEventListener("click", startBubbles);

  /* ---------- 記憶花園 ---------- */
  const MEM_ICONS = ["😊", "😌", "🌻", "🌈", "🐣", "🍀"];
  const memory = { first: null, lock: false, pairs: 0, tries: 0 };

  function buildMemory() {
    const grid = $("#memoryGrid");
    grid.innerHTML = "";
    memory.first = null;
    memory.lock = false;
    memory.pairs = 0;
    memory.tries = 0;
    $("#memoryPairs").textContent = "0";
    $("#memoryTries").textContent = "0";
    const deck = MEM_ICONS.concat(MEM_ICONS)
      .map((icon) => ({ icon, k: Math.random() }))
      .sort((a, b) => a.k - b.k);
    deck.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "mcard";
      btn.setAttribute("aria-label", "未揭開的卡");
      btn.innerHTML = `<span class="mcard-inner"><span class="mface mfront">?</span><span class="mface mback">${c.icon}</span></span>`;
      btn.dataset.icon = c.icon;
      btn.addEventListener("click", () => flipCard(btn));
      grid.appendChild(btn);
    });
  }

  function flipCard(card) {
    if (memory.lock || card.classList.contains("flipped") || card.classList.contains("matched")) return;
    card.classList.add("flipped");
    card.setAttribute("aria-label", "已揭開：" + card.dataset.icon);
    popSound();
    if (!memory.first) {
      memory.first = card;
      return;
    }
    memory.tries++;
    $("#memoryTries").textContent = memory.tries;
    if (memory.first.dataset.icon === card.dataset.icon) {
      memory.first.classList.add("matched");
      card.classList.add("matched");
      memory.first = null;
      memory.pairs++;
      $("#memoryPairs").textContent = memory.pairs;
      chime(1046, 0.28);
      if (memory.pairs === MEM_ICONS.length) {
        setTimeout(finishMemory, 420);
      }
    } else {
      memory.lock = true;
      const a = memory.first;
      setTimeout(() => {
        a.classList.remove("flipped");
        card.classList.remove("flipped");
        a.setAttribute("aria-label", "未揭開的卡");
        card.setAttribute("aria-label", "未揭開的卡");
        memory.first = null;
        memory.lock = false;
      }, 780);
    }
  }

  function finishMemory() {
    addStars(2, "⭐ +2　全部配對成功！");
    if (!state.memoryDone) {
      state.memoryDone = true;
      save();
    }
    checkBadges();
    updateHUD();
    speak("全部配對成功！你嘅記憶力同專注力都好犀利。");
    chime(1318, 0.6);
  }

  $("#memoryRestart").addEventListener("click", () => {
    buildMemory();
    chime(660, 0.2);
  });
  $$(".chip[data-game]").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".chip[data-game]").forEach((c) => {
        c.classList.toggle("is-active", c === chip);
        c.setAttribute("aria-selected", String(c === chip));
      });
      $("#game-bubbles").classList.toggle("is-active", chip.dataset.game === "bubbles");
      $("#game-memory").classList.toggle("is-active", chip.dataset.game === "memory");
      stopSpeak();
    });
  });

  /* ---------- 感恩日記 ---------- */
  const MOOD_ICON = { "好開心": "😄", "唔錯": "🙂", "一般": "😐", "有啲煩": "😕", "好唔開心": "😢" };
  let mood = "";

  $$(".mood").forEach((btn) => {
    btn.addEventListener("click", () => {
      mood = btn.dataset.mood;
      $$(".mood").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      popSound();
    });
  });

  function saveGratitude() {
    const vals = [1, 2, 3].map((i) => ($("#grat" + i).value || "").trim());
    if (!vals.some((v) => v)) {
      toast("寫低最少一件事先啦 😊");
      return;
    }
    const key = todayKey();
    const isNew = !state.gratitude[key];
    state.gratitude[key] = { mood: mood, items: vals.filter(Boolean), ts: Date.now() };
    save();
    renderGratitude();
    if (isNew) {
      addStars(2, "⭐ +2　今日嘅感恩日記已儲存！");
      speak("多謝你寫低今日嘅美好。懂得感恩，心就會暖暖。");
    } else {
      toast("✅ 今日日記已更新");
    }
    checkBadges();
    updateHUD();
  }

  function streakDays() {
    let n = 0;
    const d = new Date();
    // 如果今日未寫，就由昨日開始計
    if (!state.gratitude[todayKey(d)]) d.setDate(d.getDate() - 1);
    while (state.gratitude[todayKey(d)]) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function renderGratitude() {
    const list = $("#gratList");
    const keys = Object.keys(state.gratitude).sort().reverse();
    const total = keys.length;
    $("#gratStreak").textContent = `連續記錄：${streakDays()} 日 · 總共 ${total} 篇`;
    if (!total) {
      list.innerHTML = '<li class="grat-empty">仲未開始寫… 寫完第一篇，呢度就會出現你嘅小紀錄。</li>';
      return;
    }
    list.innerHTML = "";
    keys.slice(0, 30).forEach((k) => {
      const rec = state.gratitude[k];
      const li = document.createElement("li");
      const dateText = k.replace(/-/g, "/");
      li.innerHTML =
        `<span class="gmood">${MOOD_ICON[rec.mood] || ""}</span>` +
        `<span class="gdate">${dateText}</span>` +
        (rec.items || []).map((t) => "・" + escapeHtml(t)).join("<br>");
      list.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  $("#gratSave").addEventListener("click", saveGratitude);
  $("#gratListen").addEventListener("click", () => {
    const vals = [1, 2, 3].map((i) => ($("#grat" + i).value || "").trim()).filter(Boolean);
    if (!vals.length) {
      toast("寫低幾句，我先讀俾你聽 😊");
      return;
    }
    speak("今日我好感恩。" + vals.join("。"));
  });

  /* ---------- 正向想法卡 ---------- */
  const MINDSET = [
    { tag: "遇到困難", bad: "我唔識做呢條數，我好蠢。", good: "我仲未學識。我可以問老師、睇多次例子，或者試另一個方法。" },
    { tag: "遇到困難", bad: "我畫得好醜，唔想再畫。", good: "呢幅畫有進步。我再試多一幅，會越畫越好。" },
    { tag: "遇到困難", bad: "我跑步包尾，好失敗。", good: "我今日慢咗，但我有練習。下次同自己比較，快少少就係進步。" },
    { tag: "返學日常", bad: "我成日忘記帶嘢，我好冇用。", good: "我可以寫手冊、貼提示紙，慢慢建立習慣。" },
    { tag: "返學日常", bad: "我唔敢舉手，怕答錯。", good: "答錯都係學習嘅一部分。我試下講出想法，錯咗都係勇敢。" },
    { tag: "返學日常", bad: "老師讚我，但係我怕下次做唔到。", good: "我可以記住今次做對嘅方法，再試一次。" },
    { tag: "同朋友", bad: "同學唔同我玩，一定係我唔好。", good: "可能佢哋有自己的計劃。我可以問下其他同學，或者做自己喜歡嘅事。" },
    { tag: "同朋友", bad: "我同朋友吵架，好唔開心。", good: "唔開心係正常嘅。我可以先深呼吸，準備好就同佢講返我嘅感受。" },
    { tag: "情緒", bad: "我好緊張，一定做唔好。", good: "緊張代表我在乎。我可以慢慢呼吸，一步一步做。" },
    { tag: "情緒", bad: "我成日發脾氣，我控制唔到。", good: "我可以練習：停一停、深呼吸、講出感受。每次練習都算成功。" },
  ];
  let flipped = new Set(state.mindFlipped || []);

  function renderMind() {
    const grid = $("#mindGrid");
    grid.innerHTML = "";
    MINDSET.forEach((m, i) => {
      const card = document.createElement("button");
      card.className = "flip";
      card.setAttribute("aria-label", `正向想法卡 ${i + 1}，點擊翻開`);
      card.innerHTML = `
        <span class="flip-inner">
          <span class="flip-face flip-front">
            <span class="flip-tag">😣 卡住嘅想法 · ${m.tag}</span>
            <span class="flip-text">「${m.bad}」</span>
            <span class="flip-hint">點一下，睇另一個講法 →</span>
          </span>
          <span class="flip-face flip-back">
            <span class="flip-tag">🌱 換個講法</span>
            <span class="flip-text">「${m.good}」</span>
            <span class="flip-hint">← 再點一下返回</span>
          </span>
        </span>`;
      card.addEventListener("click", () => {
        card.classList.toggle("flipped");
        if (card.classList.contains("flipped")) {
          popSound();
          flipped.add(i);
          state.mindFlipped = Array.from(flipped);
          save();
          checkBadges();
          speak(m.good.replace(/「|」/g, ""));
        }
      });
      grid.appendChild(card);
    });
  }

  /* ---------- 影片 ---------- */
  const VIDEOS = [
    {
      id: "j2OFYUjIevQ",
      title: "保良局正向教育動畫 第一集《成長型思維》",
      channel: "保良局小學正向",
      cats: ["cantonese", "positive"],
      desc: "咩係成長型思維？用動畫故事講解「努力可以令我進步」。",
    },
    {
      id: "bLu0IbhqgDY",
      title: "保良局正向教育動畫 第二集《細味生活》",
      channel: "保良局小學正向",
      cats: ["cantonese", "positive", "mind"],
      desc: "學習「深吸慢呼」同「細味」，將注意力放返喺當下。",
    },
    {
      id: "K0GumQN6qiw",
      title: "開心小貼士｜三件好東西（學習感恩）",
      channel: "jollyisland",
      cats: ["cantonese", "positive"],
      desc: "每日諗三件好事，心情會慢慢變好。同感恩日記一齊用。",
    },
    {
      id: "icKQgvAuXl8",
      title: "廣東話兒童冥想靜心練習｜蝴蝶抱抱",
      channel: "Bunsmama in hk",
      cats: ["cantonese", "mind"],
      desc: "打開手臂做蝴蝶翅膀，跟住呼吸慢慢拍動，學習放鬆。",
    },
    {
      id: "BAnOlEwI0SE",
      title: "靜觀練習｜三分鐘呼吸空間（廣東話）",
      channel: "CUHK - Office of Student Affairs",
      cats: ["cantonese", "mind"],
      desc: "三分鐘呼吸空間：適合返學前或放學後快速靜一靜。",
    },
    {
      id: "dHUo4ZYdGk8",
      title: "7 分鐘兒童靜觀身體掃描練習",
      channel: "Cheers Psy Consultancy",
      cats: ["cantonese", "mind"],
      desc: "由頭到腳的身體掃描，同網站內「身體掃描」單元互相配合。",
    },
    {
      id: "e5WSOKUiOm0",
      title: "靜觀呼吸練習（偕同頻道．身心靈系列）",
      channel: "香港聖公會福利協會",
      cats: ["cantonese", "mind"],
      desc: "簡單引導式呼吸練習，適合親子一齊做。",
    },
    {
      id: "paTVMheICxM",
      title: "Balloon Breathing（5 分鐘引導冥想）",
      channel: "Noah's Mindful Journey",
      cats: ["english", "mind"],
      desc: "想像肚入面有個氣球，慢慢吹脹、慢慢放氣。",
    },
    {
      id: "IIbBI-BT9c4",
      title: "Rainbow Relaxation: Mindfulness for Children",
      channel: "The Mindfulness Teacher",
      cats: ["english", "mind"],
      desc: "彩虹放鬆練習：一邊伸展身體，一邊深呼吸。",
    },
    {
      id: "BzJOKN34fG8",
      title: "Space Bunny Meditation（情緒調節）",
      channel: "Playapy",
      cats: ["english", "mind"],
      desc: "同太空兔一齊練習平靜情緒，適合瞓前收心。",
    },
    {
      id: "yESvEvBPR-A",
      title: "Grateful Monkey Meditation（感恩練習）",
      channel: "Playapy",
      cats: ["english", "mind"],
      desc: "用感恩練習完結一日，同「感恩日記」好配。",
    },
    {
      id: "shR8DLyOkcg",
      title: "Mindfulness Meditation for Kids",
      channel: "Beth Kurland",
      cats: ["english", "mind"],
      desc: "約 5 分鐘，帶小朋友留意身體感覺同呼吸。",
    },
  ];
  let videoFilter = "all";

  function renderVideos() {
    const grid = $("#videoGrid");
    grid.innerHTML = "";
    VIDEOS.filter((v) => videoFilter === "all" || v.cats.includes(videoFilter)).forEach((v) => {
      const card = document.createElement("button");
      card.className = "vcard";
      card.setAttribute("aria-label", "播放影片：" + v.title);
      const langTag = v.cats.includes("cantonese") ? "🗣️ 廣東話" : "🌍 英文";
      card.innerHTML = `
        <span class="vthumb" style="background-image:url('https://i.ytimg.com/vi/${v.id}/hqdefault.jpg')">
          <span class="play" aria-hidden="true">▶</span>
        </span>
        <span class="vbody">
          <span class="vtitle">${v.title}</span>
          <span class="vmeta">${v.channel}</span>
          <span class="vmeta" style="opacity:.85">${v.desc}</span>
          <span class="vtag">${langTag}</span>
        </span>`;
      card.addEventListener("click", () => {
        const frame = document.createElement("div");
        frame.className = "vframe";
        frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0" title="${v.title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>`;
        card.replaceWith(frame);
        speak("開始播放：" + v.title, { rate: 1 });
      });
      grid.appendChild(card);
    });
  }

  $$(".chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      videoFilter = chip.dataset.filter;
      $$(".chip[data-filter]").forEach((c) => c.classList.toggle("is-active", c === chip));
      renderVideos();
    });
  });

  /* ---------- 重設 ---------- */
  $("#resetBtn").addEventListener("click", () => {
    if (!window.confirm("確定要清除所有星星同紀錄嗎？（呢個動作不能復原）")) return;
    state = { ...DEFAULT_STATE };
    save();
    flipped = new Set();
    $("#grat1").value = $("#grat2").value = $("#grat3").value = "";
    $$(".mood").forEach((b) => b.setAttribute("aria-pressed", "false"));
    mood = "";
    renderGratitude();
    buildMemory();
    renderMind();
    updateHUD();
    checkBadges(true);
    toast("已重新開始，加油！🌈");
  });

  /* ---------- 初始化 ---------- */
  function init() {
    $("#soundBtn").setAttribute("aria-pressed", String(state.sound));
    $("#soundBtn").textContent = state.sound ? "🔔" : "🔕";
    $("#voiceBtn").setAttribute("aria-pressed", String(state.voice));
    $("#voiceBtn").textContent = state.voice ? "🗣️" : "🤐";
    newQuote();
    renderScan();
    buildMemory();
    renderMind();
    renderVideos();
    renderGratitude();
    updateHUD();
    checkBadges(true);
    $("#breathCycles").textContent = "0";
    const hash = (location.hash || "").replace("#", "");
    if (hash && VIEWS.includes(hash)) go(hash, true);
  }
  init();
})();

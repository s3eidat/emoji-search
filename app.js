/* Emoji Search — embedded data (data.js), local search in English and Arabic. Only recent picks and skin tone are stored locally. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var CATS = [
    ["recent", "Recent", "🕘"], ["all", "All", "✨"], ["smileys", "Smileys", "😀"], ["people", "People", "👋"], ["nature", "Nature", "🐶"],
    ["food", "Food", "🍔"], ["travel", "Travel", "✈️"], ["activities", "Activities", "⚽"], ["objects", "Objects", "💡"], ["symbols", "Symbols", "❤️"], ["flags", "Flags", "🏁"]
  ];
  var TONES = ["", "\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];
  var TONE_NAMES = ["Default", "Light", "Medium-light", "Medium", "Medium-dark", "Dark"];

  // ---------- helpers ----------
  function normalize(s) {
    return String(s).toLowerCase()
      .replace(/[ً-ٰٟـ]/g, "") // Arabic diacritics + tatweel
      .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
  }
  function flag(code) { return Array.from(code.toUpperCase()).map(function (c) { return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65); }).join(""); }
  // Skin tone goes right after the first code point (dropping a following VS16), which covers single emoji and simple sequences.
  function applyTone(e, tone) {
    if (!tone) return e;
    var cps = Array.from(e), first = cps.shift();
    if (cps[0] === "️") cps.shift();
    return first + tone + cps.join("");
  }
  function codepoints(e) { return Array.from(e).map(function (c) { return "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"); }).join(" "); }
  function htmlEntity(e) { return Array.from(e).map(function (c) { return "&#x" + c.codePointAt(0).toString(16).toUpperCase() + ";"; }).join(""); }

  // ---------- data ----------
  var ALL = [], seen = new Set();
  Object.keys(window.EMOJI_DATA || {}).forEach(function (cat) {
    window.EMOJI_DATA[cat].split("\n").forEach(function (line) {
      var p = line.split("|"); if (p.length < 4) return;
      var tone = p[0].charAt(0) === "~", e = tone ? p[0].slice(1) : p[0];
      if (seen.has(e)) return; seen.add(e);
      ALL.push({ e: e, name: p[1], kw: p[2], ar: p[3], cat: cat, tone: tone });
    });
  });
  (window.EMOJI_FLAGS || "").split("\n").forEach(function (line) {
    var p = line.split("|"); if (p.length < 3) return;
    var e = flag(p[0]); if (seen.has(e)) return; seen.add(e);
    ALL.push({ e: e, name: "flag: " + p[1], kw: "flag country " + p[0].toLowerCase(), ar: "علم " + p[2], cat: "flags", tone: false });
  });
  ALL.forEach(function (x, i) {
    x.i = i;
    x.nameN = normalize(x.name);
    x.nameW = x.nameN.split(/[\s:]+/).filter(Boolean);
    x.kwW = normalize(x.kw).split(/\s+/).filter(Boolean);
    x.arW = normalize(x.ar).split(/\s+/).filter(Boolean);
  });
  var BY_EMOJI = new Map(ALL.map(function (x) { return [x.e, x]; }));

  function search(q, cat) {
    var qn = normalize(q).trim(), tokens = qn.split(/\s+/).filter(Boolean);
    var pool = cat && cat !== "all" ? ALL.filter(function (x) { return x.cat === cat; }) : ALL;
    if (!tokens.length) return pool;
    var out = [];
    pool.forEach(function (x) {
      var score = 0;
      for (var t = 0; t < tokens.length; t++) {
        var tok = tokens[t], s = 0;
        if (x.nameW.some(function (w) { return w === tok; })) s = x.kwW.indexOf(tok) >= 0 ? 15 : 12; // keyword confirms the main meaning
        else if (x.nameW.some(function (w) { return w.indexOf(tok) === 0; })) s = 8;
        else if (x.kwW.some(function (w) { return w === tok; }) || x.arW.some(function (w) { return w === tok; })) s = 6;
        else if (x.kwW.some(function (w) { return w.indexOf(tok) === 0; }) || x.arW.some(function (w) { return w.indexOf(tok) === 0; })) s = 4;
        else if (tok.length > 2 && (x.nameN.indexOf(tok) >= 0)) s = 2;
        if (!s) return;
        score += s;
      }
      if (x.nameN === qn) score += 40;
      out.push({ x: x, s: score });
    });
    out.sort(function (a, b) { return b.s - a.s || a.x.nameN.length - b.x.nameN.length || a.x.i - b.x.i; });
    return out.map(function (o) { return o.x; });
  }

  // ---------- state + UI ----------
  var state = { cat: S3.store("emoji.cat") || "all", tone: S3.store("emoji.tone") || 0, q: "", list: [], current: null };
  if (!CATS.some(function (c) { return c[0] === state.cat; })) state.cat = "all";
  function recent() { return (S3.store("emoji.recent") || []).filter(function (r) { return typeof r === "string"; }); }
  function pushRecent(e) { var r = recent().filter(function (x) { return x !== e; }); r.unshift(e); S3.store("emoji.recent", r.slice(0, 36)); }
  function shown(x) { return x.tone ? applyTone(x.e, TONES[state.tone]) : x.e; }
  function lookupRecent(e) {
    var cps = Array.from(e).filter(function (c) { return TONES.indexOf(c) < 1; }); // drop any skin-tone modifier
    var base = BY_EMOJI.get(cps.join("")) || BY_EMOJI.get(cps[0] + "\uFE0F" + cps.slice(1).join(""));
    return { e: e, name: base ? base.name : "emoji", kw: base ? base.kw : "", ar: base ? base.ar : "", fixed: true };
  }

  var tonesEl = $("#tones");
  TONES.forEach(function (t, i) {
    tonesEl.appendChild(S3.h("button", { "aria-pressed": String(i === state.tone), title: TONE_NAMES[i] + " skin tone", "aria-label": TONE_NAMES[i] + " skin tone", "data-i": i,
      onclick: function () { state.tone = i; S3.store("emoji.tone", i); $$("button", tonesEl).forEach(function (b) { b.setAttribute("aria-pressed", String(+b.dataset.i === i)); }); render(); } }, [applyTone("✋", t)]));
  });
  var catsEl = $("#cats");
  CATS.forEach(function (c) {
    catsEl.appendChild(S3.h("button", { "aria-pressed": String(c[0] === state.cat), "data-c": c[0],
      onclick: function () { state.cat = c[0]; S3.store("emoji.cat", c[0]); $$("button", catsEl).forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.c === c[0])); }); render(); } },
      [S3.h("span", { "class": "es-ci", "aria-hidden": "true" }, [c[2]]), c[1]]));
  });

  var grid = $("#grid");
  function render() {
    var list, title;
    if (state.cat === "recent") {
      list = recent().map(lookupRecent);
      title = "Recently used";
    } else {
      list = search(state.q, state.cat);
      title = state.q ? "Results for “" + state.q + "”" : (CATS.filter(function (c) { return c[0] === state.cat; })[0] || CATS[1])[1] + (state.cat === "all" ? " emoji" : "");
    }
    state.list = list;
    $("#title").textContent = title;
    $("#count").textContent = list.length.toLocaleString() + " emoji";
    grid.innerHTML = "";
    var frag = document.createDocumentFragment();
    list.forEach(function (x, i) {
      var e = x.fixed ? x.e : shown(x);
      frag.appendChild(S3.h("button", { "class": "es-e", role: "listitem", title: x.name, "aria-label": x.name, "data-i": i }, [e]));
    });
    grid.appendChild(frag);
    $("#empty").hidden = list.length > 0;
    if (state.cat === "recent" && !list.length) { $("#empty").innerHTML = "<b>Nothing here yet</b>Emoji you copy will show up here."; }
    else $("#empty").innerHTML = "<b>No emoji found</b>Try a shorter word, or another language.";
    if (list.length) show(list[0]);
  }
  function show(x) {
    var e = x.fixed ? x.e : shown(x);
    state.current = { x: x, e: e };
    $("#big").textContent = e; $("#dname").textContent = x.name;
    $("#dkw").textContent = [x.kw, x.ar].filter(Boolean).join(" · ");
    $("#dkw").dir = "auto";
    $("#dcp").textContent = codepoints(e); $("#dhtml").textContent = htmlEntity(e);
  }
  function copyEmoji(x) {
    var e = x.fixed ? x.e : shown(x);
    S3.copy(e, "Copied " + e);
    pushRecent(e); show(x); S3.done();
  }
  grid.addEventListener("click", function (ev) { var b = ev.target.closest(".es-e"); if (b) copyEmoji(state.list[+b.dataset.i]); });
  grid.addEventListener("mouseover", function (ev) { var b = ev.target.closest(".es-e"); if (b) show(state.list[+b.dataset.i]); });
  grid.addEventListener("focusin", function (ev) { var b = ev.target.closest(".es-e"); if (b) show(state.list[+b.dataset.i]); });
  grid.addEventListener("keydown", function (ev) {
    var b = ev.target.closest(".es-e"); if (!b) return;
    var i = +b.dataset.i, cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length || 1;
    var to = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: state.list.length - 1 }[ev.key];
    if (to === undefined) return;
    ev.preventDefault();
    var target = grid.children[Math.max(0, Math.min(state.list.length - 1, to))];
    if (target) target.focus();
  });

  var q = $("#q");
  q.addEventListener("input", S3.debounce(function () {
    state.q = q.value;
    if (state.q && state.cat !== "all") { state.cat = "all"; $$("button", catsEl).forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.c === "all")); }); }
    render();
  }, 80));
  q.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && state.list.length) { e.preventDefault(); copyEmoji(state.list[0]); }
    else if (e.key === "Escape") { q.value = ""; state.q = ""; render(); }
    else if (e.key === "ArrowDown" && grid.firstChild) { e.preventDefault(); grid.firstChild.focus(); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== q && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); q.select(); }
  });
  $("#cEmoji").addEventListener("click", function () { if (state.current) copyEmoji(state.current.x); });
  $("#cCode").addEventListener("click", function () { if (state.current) S3.copy(codepoints(state.current.e), "Code points copied"); });
  $("#cHtml").addEventListener("click", function () { if (state.current) S3.copy(htmlEntity(state.current.e), "HTML entity copied"); });
  render();

  window.S3_DEMO = function () { q.value = "heart"; state.q = "heart"; state.cat = "all"; render(); };

  window.S3_SELFTEST = function () {
    var fails = [];
    function check(c, w) { if (!c) fails.push(w); }
    function top(qs, n) { return search(qs).slice(0, n || 1).map(function (x) { return x.e; }); }
    check(ALL.length >= 1000 && seen.size === ALL.length, "dataset size " + ALL.length);
    check(top("thumbs up")[0] === "👍", "thumbs up");
    check(top("red heart")[0] === "❤️", "red heart");
    check(top("heart")[0] === "❤️", "heart first");
    check(top("قلب", 30).indexOf("❤️") >= 0, "Arabic search");
    check(top("شكرا", 5).indexOf("🙏") >= 0, "Arabic thanks");
    check(top("jordan")[0] === "🇯🇴" && top("الاردن")[0] === "🇯🇴", "flag search (with hamza normalisation)");
    check(search("zzqqxx").length === 0, "no false matches");
    check(flag("JO") === "\u{1F1EF}\u{1F1F4}", "flag build");
    check(applyTone("👍", TONES[3]) === "\u{1F44D}\u{1F3FD}", "tone simple");
    check(applyTone("☝️", TONES[1]) === "☝\u{1F3FB}", "tone drops VS16");
    check(applyTone("👍", "") === "👍", "default tone");
    check(codepoints("\u{1F44D}\u{1F3FD}") === "U+1F44D U+1F3FD" && htmlEntity("👍") === "&#x1F44D;", "codes");
    check(normalize("أهلاً") === "اهلا", "normalize");
    ALL.forEach(function (x) {
      if (x.tone && Array.from(x.e).filter(function (c) { return c !== "️"; }).length !== 1) fails.push("tone base not single: " + x.name);
      if (!x.name || x.e.length > 16) fails.push("bad entry " + x.name);
    });
    if (fails.length) console.error("selftest: " + fails.join("; "));
    return fails.length === 0;
  };
})();

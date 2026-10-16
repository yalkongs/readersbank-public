// src/lib/reader-settings.ts와 동일하게 유지
try {
  var raw = localStorage.getItem("rb-reader");
  var o = null;
  if (raw !== null) {
    try {
      o = JSON.parse(raw);
    } catch (e) {}
  }
  if (typeof o !== "object") o = null;
  var s = { size: 3, bg: "gray", font: "serif", leading: "normal" };
  if (o) {
    if ([1, 2, 3, 4, 5].indexOf(o.size) >= 0) s.size = o.size;
    if (["auto", "white", "sepia", "gray", "black"].indexOf(o.bg) >= 0) s.bg = o.bg;
    if (["sans", "serif"].indexOf(o.font) >= 0) s.font = o.font;
    if (["tight", "normal", "loose"].indexOf(o.leading) >= 0) s.leading = o.leading;
  } else if (raw === null) {
    var t = localStorage.getItem("rb-theme");
    if (t === "dark") s.bg = "black";
    else if (t === "light") s.bg = "white";
  }
  var el = document.documentElement;
  // 글 목록 보기 방식(src/components/ViewToggle.tsx)
  if (localStorage.getItem("rb-view") === "grid") el.setAttribute("data-view", "grid");
  el.setAttribute("data-size", String(s.size));
  el.setAttribute("data-font", s.font);
  el.setAttribute("data-leading", s.leading);
  if (s.bg !== "auto") {
    el.setAttribute("data-bg", s.bg);
    el.setAttribute("data-theme", s.bg === "black" ? "dark" : "light");
  }
} catch (e) {}

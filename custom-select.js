/**
 * Lightweight custom dropdown that progressively enhances native <select>.
 * The native <select> stays in the DOM as the source of truth (hidden), so all
 * existing logic (els.X.value, "input"/"change" listeners, currentSeed) keeps
 * working untouched. The custom UI just mirrors it and writes the value back.
 *
 * The panel is appended to <body> (a portal) and positioned with fixed coords.
 * This is required because the sidebar cards use `backdrop-filter`, which makes
 * any `position: fixed` descendant resolve against the card instead of the
 * viewport (and traps its z-index). Rendering the panel at the body level
 * escapes that containing block, so it opens correctly below the trigger and
 * stacks above everything.
 */
(function () {
  var openInstance = null; // { wrap, panel, close }

  function closeOpen() {
    if (openInstance) openInstance.close();
  }

  function enhance(select) {
    if (select.dataset.csEnhanced) return;
    select.dataset.csEnhanced = "1";

    var wrap = document.createElement("div");
    wrap.className = "cs-field";
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add("cs-native");

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "cs-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span class="cs-value"></span><i class="cs-arrow" aria-hidden="true"></i>';
    wrap.appendChild(trigger);

    // Panel lives at the body level (portal) to escape backdrop-filter ancestors
    var panel = document.createElement("div");
    panel.className = "cs-panel";
    panel.setAttribute("role", "listbox");
    panel.tabIndex = -1;
    panel.hidden = true;
    document.body.appendChild(panel);

    var valueEl = trigger.querySelector(".cs-value");

    function syncValue() {
      var opt = select.options[select.selectedIndex];
      valueEl.textContent = opt ? opt.textContent : "";
    }

    function position() {
      var r = trigger.getBoundingClientRect();
      panel.style.left = r.left + "px";
      panel.style.width = r.width + "px";
      var spaceBelow = window.innerHeight - r.bottom;
      var needed = Math.min(panel.scrollHeight || 240, 260) + 12;
      if (spaceBelow < needed && r.top > spaceBelow) {
        panel.style.top = "auto";
        panel.style.bottom = (window.innerHeight - r.top + 6) + "px";
      } else {
        panel.style.bottom = "auto";
        panel.style.top = (r.bottom + 6) + "px";
      }
    }

    function setActive(el) {
      panel.querySelectorAll(".cs-option").forEach(function (i) { i.classList.remove("cs-active"); });
      if (el) { el.classList.add("cs-active"); el.scrollIntoView({ block: "nearest" }); }
    }

    function buildOptions() {
      panel.innerHTML = "";
      Array.prototype.forEach.call(select.options, function (opt) {
        var o = document.createElement("div");
        o.className = "cs-option" + (opt.selected ? " selected" : "");
        o.setAttribute("role", "option");
        o.setAttribute("aria-selected", opt.selected ? "true" : "false");
        o.tabIndex = -1;
        o.dataset.value = opt.value;
        var label = document.createElement("span");
        label.className = "cs-opt-label";
        label.textContent = opt.textContent;
        o.appendChild(label);
        if (opt.selected) {
          var chk = document.createElement("i");
          chk.className = "ri-check-line cs-check";
          chk.setAttribute("aria-hidden", "true");
          o.appendChild(chk);
        }
        o.addEventListener("click", function () {
          if (select.value !== opt.value) {
            select.value = opt.value;
            select.dispatchEvent(new Event("input", { bubbles: true }));
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          syncValue();
          close();
          trigger.focus();
        });
        panel.appendChild(o);
      });
    }

    function open() {
      closeOpen();
      buildOptions();
      panel.hidden = false;
      wrap.classList.add("cs-open");
      trigger.setAttribute("aria-expanded", "true");
      position();
      openInstance = { wrap: wrap, panel: panel, close: close };
      setActive(panel.querySelector(".cs-option.selected") || panel.querySelector(".cs-option"));
    }

    function close() {
      panel.hidden = true;
      wrap.classList.remove("cs-open");
      trigger.setAttribute("aria-expanded", "false");
      if (openInstance && openInstance.panel === panel) openInstance = null;
    }

    trigger.addEventListener("click", function (e) {
      e.preventDefault();
      if (panel.hidden) open(); else close();
    });

    trigger.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (panel.hidden) open();
        panel.focus();
      } else if (e.key === "Escape") {
        close();
      }
    });

    panel.addEventListener("keydown", function (e) {
      var items = Array.prototype.slice.call(panel.querySelectorAll(".cs-option"));
      var cur = panel.querySelector(".cs-option.cs-active");
      var idx = items.indexOf(cur);
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(items[Math.min(idx + 1, items.length - 1)] || items[0]); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(items[Math.max(idx - 1, 0)] || items[0]); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (cur) cur.click(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); trigger.focus(); }
    });

    select.addEventListener("change", syncValue);
    select._csSync = syncValue;
    syncValue();
  }

  function init(root) {
    (root || document).querySelectorAll(".sidebar select").forEach(enhance);
  }

  function refresh() {
    document.querySelectorAll("select.cs-native").forEach(function (s) {
      if (typeof s._csSync === "function") s._csSync();
    });
  }

  // Close on outside click / Esc; close on scroll & resize (panel is fixed)
  document.addEventListener("click", function (e) {
    if (openInstance && !openInstance.wrap.contains(e.target) && !openInstance.panel.contains(e.target)) {
      closeOpen();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeOpen();
  });
  window.addEventListener("resize", closeOpen);
  window.addEventListener("scroll", closeOpen, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); });
  } else {
    init();
  }

  window.CustomSelect = { init: init, refresh: refresh };
})();

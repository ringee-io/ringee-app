/*
 * Ringee Dialer SDK — Live Playground
 * -----------------------------------
 * A real, deployable playground that drives the *production* SDK bundle
 * (`window.Ringee`, the exact IIFE shipped to unpkg/jsDelivr) against a real
 * Ringee backend. It covers all three integration modes (Floating, Bar,
 * Headless), places real WebRTC calls, and is fully runtime-configurable so the
 * same static build works locally (apiUrl → http://localhost:3000) and in
 * production (apiUrl → your deployed API) with no rebuild.
 *
 * Config precedence:  URL query (?pk=…&api=…&mode=…)  >  localStorage  >
 * build-time defaults (window.__RINGEE_PLAYGROUND_DEFAULTS__, injected by
 * build.mjs from env)  >  smart fallbacks.
 */
(function () {
  "use strict";

  var $ = function (id) {
    return document.getElementById(id);
  };
  var STORE_KEY = "ringee.playground.config.v1";
  var DEFAULTS = window.__RINGEE_PLAYGROUND_DEFAULTS__ || {};

  // ── SDK availability guard ───────────────────────────────────────────────
  if (typeof window.Ringee === "undefined" || !window.Ringee.createFloating) {
    $("sdkSrc").textContent =
      "⚠ SDK no cargado — corré `node build.mjs` para copiar ringee.global.js a ./vendor";
    $("sdkSrc").style.color = "var(--danger)";
    return;
  }
  $("sdkSrc").textContent =
    "SDK cargado · origen actual: " + window.location.origin;

  // ── Config model ─────────────────────────────────────────────────────────
  var FIELDS = [
    "pk",
    "apiUrl",
    "agentEmail",
    "mode",
    "locale",
    "scheme",
    "allowHold",
    "debug",
    "cName",
    "cNumber",
    "cExt",
  ];

  function smartApiDefault() {
    if (DEFAULTS.apiUrl) return DEFAULTS.apiUrl;
    var h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "") {
      return "http://localhost:3000";
    }
    return "https://api.ringee.io";
  }

  function loadConfig() {
    var cfg = {
      pk: DEFAULTS.pk || "",
      apiUrl: smartApiDefault(),
      agentEmail: DEFAULTS.agentEmail || "",
      mode: "floating",
      locale: DEFAULTS.locale || "es",
      scheme: "auto",
      allowHold: false,
      debug: false,
      cName: "",
      cNumber: "",
      cExt: "",
    };
    // localStorage overrides defaults.
    try {
      var stored = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      FIELDS.forEach(function (k) {
        if (stored[k] !== undefined) cfg[k] = stored[k];
      });
    } catch (_) {}
    // URL query overrides everything (shareable links).
    var q = new URLSearchParams(window.location.search);
    var map = { pk: "pk", api: "apiUrl", email: "agentEmail", mode: "mode", locale: "locale", theme: "scheme", hold: "allowHold", debug: "debug", to: "cNumber", name: "cName" };
    Object.keys(map).forEach(function (qk) {
      if (q.has(qk)) {
        var v = q.get(qk);
        var f = map[qk];
        cfg[f] = f === "allowHold" || f === "debug" ? v === "1" || v === "true" : v;
      }
    });
    return cfg;
  }

  function readForm() {
    return {
      pk: $("pk").value.trim(),
      apiUrl: $("apiUrl").value.trim().replace(/\/$/, ""),
      agentEmail: $("agentEmail").value.trim(),
      mode: document.body.getAttribute("data-mode"),
      locale: $("locale").value,
      scheme: $("scheme").value,
      allowHold: $("allowHold").checked,
      debug: $("debug").checked,
      cName: $("cName").value.trim(),
      cNumber: $("cNumber").value.trim(),
      cExt: $("cExt").value.trim(),
    };
  }

  function writeForm(cfg) {
    $("pk").value = cfg.pk;
    $("apiUrl").value = cfg.apiUrl;
    $("agentEmail").value = cfg.agentEmail;
    $("locale").value = cfg.locale;
    $("scheme").value = cfg.scheme;
    $("allowHold").checked = !!cfg.allowHold;
    $("debug").checked = !!cfg.debug;
    $("cName").value = cfg.cName;
    $("cNumber").value = cfg.cNumber;
    $("cExt").value = cfg.cExt;
    setMode(cfg.mode || "floating", false);
    // Mirror into headless-specific inputs.
    $("hlEmail").value = cfg.agentEmail;
    if (cfg.cNumber) $("hlTo").value = cfg.cNumber;
  }

  function persist(cfg) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
    } catch (_) {}
  }

  function shareUrl(cfg) {
    var q = new URLSearchParams();
    if (cfg.pk) q.set("pk", cfg.pk);
    if (cfg.apiUrl) q.set("api", cfg.apiUrl);
    if (cfg.agentEmail) q.set("email", cfg.agentEmail);
    q.set("mode", cfg.mode);
    q.set("locale", cfg.locale);
    if (cfg.scheme !== "auto") q.set("theme", cfg.scheme);
    if (cfg.allowHold) q.set("hold", "1");
    if (cfg.debug) q.set("debug", "1");
    if (cfg.cNumber) q.set("to", cfg.cNumber);
    if (cfg.cName) q.set("name", cfg.cName);
    return window.location.origin + window.location.pathname + "?" + q.toString();
  }

  // ── Logging + status pills ───────────────────────────────────────────────
  function log(msg, cls) {
    var t = new Date().toLocaleTimeString();
    var line = document.createElement("div");
    if (cls) line.className = cls;
    line.innerHTML = '<span class="ev-t">' + t + "</span>  " + escapeHtml(msg);
    var el = $("log");
    el.insertBefore(line, el.firstChild);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }
  function setPill(which, value, cls) {
    var el = $(which === "auth" ? "pillAuth" : "pillCall");
    el.querySelector("b").textContent = value;
    el.className = "pill" + (cls ? " " + cls : "");
  }

  // ── Mode segmented control ───────────────────────────────────────────────
  function setMode(mode, doPersist) {
    document.body.setAttribute("data-mode", mode);
    Array.prototype.forEach.call($("modeSeg").children, function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === mode));
    });
    if (doPersist !== false) {
      var cfg = readForm();
      persist(cfg);
    }
  }
  Array.prototype.forEach.call($("modeSeg").children, function (b) {
    b.addEventListener("click", function () {
      setMode(b.getAttribute("data-mode"));
    });
  });

  // ── SDK instance lifecycle ───────────────────────────────────────────────
  var controller = null; // FloatingController | BarController | null
  var dialer = null; // RingeeDialer (own, headless) or controller.dialer
  var challengeId = null;

  function teardown() {
    try {
      if (controller && controller.destroy) controller.destroy();
    } catch (_) {}
    var d = controller && controller.dialer ? controller.dialer : dialer;
    try {
      if (d && d.destroy) d.destroy();
    } catch (_) {}
    controller = null;
    dialer = null;
    challengeId = null;
    setPill("auth", "–");
    setPill("call", "–");
  }

  function commonOptions(cfg) {
    return {
      key: cfg.pk,
      apiUrl: cfg.apiUrl,
      agentEmail: cfg.agentEmail || undefined,
      debug: cfg.debug,
      locale: cfg.locale,
      allowHold: cfg.allowHold,
      theme: { colorScheme: cfg.scheme },
      onError: function (e) {
        log("onError: " + (e && (e.code || e.message) || e), "ev-err");
      },
    };
  }

  function mount() {
    var cfg = readForm();
    if (!cfg.pk) {
      log("Falta la publishable key (pk_live_…).", "ev-err");
      $("pk").focus();
      return;
    }
    persist(cfg);
    teardown();
    log("Montando modo “" + cfg.mode + "” contra " + cfg.apiUrl + " …");

    try {
      if (cfg.mode === "floating") {
        controller = window.Ringee.createFloating(commonOptions(cfg));
        dialer = controller.dialer;
      } else if (cfg.mode === "bar") {
        var opts = commonOptions(cfg);
        opts.container = $("barMount");
        controller = window.Ringee.createBar(opts);
        dialer = controller.dialer;
      } else {
        // headless
        dialer = window.Ringee.create({
          key: cfg.pk,
          apiUrl: cfg.apiUrl,
          agentEmail: cfg.agentEmail || undefined,
          debug: cfg.debug,
        });
      }
    } catch (e) {
      log("No se pudo montar: " + (e && e.message || e), "ev-err");
      return;
    }

    wireEvents(dialer);
    applyContact(cfg);

    if (cfg.mode === "headless") {
      dialer.initialize().then(
        function () {
          log("initialize() ok", "ev-ok");
        },
        function (e) {
          log("initialize() falló: " + (e.code || "") + " — " + e.message, "ev-err");
        }
      );
    }
    // Floating/Bar call initialize() internally.
  }

  // ── Event wiring (shared by every mode) ──────────────────────────────────
  function wireEvents(d) {
    d.on("authStateChanged", function (p) {
      var okStates = { authenticated: 1 };
      var errStates = { error: 1, expired: 1 };
      setPill("auth", p.state, okStates[p.state] ? "ok" : errStates[p.state] ? "err" : "");
    });
    d.on("stateChanged", function (p) {
      var active = { active: 1, held: 1 };
      var busy = { dialing: 1, ringing: 1, connecting: 1, initializing: 1, reconnecting: 1 };
      setPill("call", p.state, active[p.state] ? "ok" : busy[p.state] ? "warn" : "");
      refreshHeadlessButtons(p.state);
    });
    d.on("authRequired", function () {
      log("authRequired — se necesita OTP");
    });
    d.on("codeSent", function (p) {
      challengeId = p.challenge.id;
      log("Código enviado a " + (p.challenge.maskedEmail || "email"), "ev-ok");
      $("hlVerify").disabled = false;
      $("hlResend").disabled = false;
    });
    d.on("signedIn", function (p) {
      var a = p.agent;
      log("signedIn: " + (a.firstName || a.email) + " (" + (a.role || "personal") + ")", "ev-ok");
      populateCallerIds();
    });
    d.on("signedOut", function () {
      log("signedOut");
    });
    d.on("sessionExpired", function () {
      log("sessionExpired", "ev-err");
    });
    d.on("ready", function () {
      log("ready — motor y agente listos", "ev-ok");
      populateCallerIds();
    });
    d.on("dialing", function (p) {
      log("dialing → " + p.call.to);
    });
    d.on("ringing", function () {
      log("ringing…");
    });
    d.on("answered", function () {
      log("answered", "ev-ok");
    });
    d.on("held", function () {
      log("held");
    });
    d.on("resumed", function () {
      log("resumed");
    });
    d.on("muted", function () {
      log("muted");
    });
    d.on("unmuted", function () {
      log("unmuted");
    });
    d.on("ended", function (p) {
      log("ended (" + (p.call.durationSeconds || 0) + "s)");
    });
    d.on("failed", function (p) {
      log("failed: " + p.error.code + " — " + p.error.message, "ev-err");
    });
    d.on("error", function (p) {
      log("error: " + p.error.code + " — " + p.error.message, "ev-err");
    });
    d.on("deviceChanged", function () {
      log("deviceChanged");
    });
  }

  function populateCallerIds() {
    if (!dialer || !dialer.getCallerIds) return;
    var ids = [];
    try {
      ids = dialer.getCallerIds() || [];
    } catch (_) {}
    var sel = $("hlCallerId");
    var current = sel.value;
    sel.innerHTML = '<option value="">(automático)</option>';
    ids.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.phoneNumber + (c.isPrimary ? " · principal" : "");
      sel.appendChild(o);
    });
    if (current) sel.value = current;
  }

  // ── Contact injection (Floating + Bar) ───────────────────────────────────
  function currentContact(cfg) {
    if (!cfg.cNumber && !cfg.cName) return null;
    return {
      name: cfg.cName || undefined,
      number: cfg.cNumber || undefined,
      externalContactId: cfg.cExt || undefined,
    };
  }
  function applyContact(cfg) {
    var c = currentContact(cfg);
    if (c && controller && controller.setContact) controller.setContact(c);
  }

  // ── Headless call-control buttons ────────────────────────────────────────
  function refreshHeadlessButtons(state) {
    var inCall = { dialing: 1, ringing: 1, active: 1, held: 1, connecting: 1, reconnecting: 1 }[state];
    var ready = state === "ready" || state === "ended";
    $("hlCall").disabled = !ready;
    ["hlMute", "hlUnmute", "hlHold", "hlResume", "hlDtmf", "hlHangup"].forEach(function (id) {
      $(id).disabled = !inCall;
    });
  }

  var guard = function (fn) {
    return function () {
      try {
        var r = fn();
        if (r && r.catch) r.catch(function (e) { log((e.code || "ERR") + ": " + e.message, "ev-err"); });
      } catch (e) {
        log((e.code || "ERR") + ": " + (e.message || e), "ev-err");
      }
    };
  };

  // Headless auth + call handlers
  $("hlSend").onclick = guard(function () {
    if (!dialer) return log("Montá primero el modo headless.", "ev-err");
    return dialer.requestEmailCode($("hlEmail").value.trim());
  });
  $("hlVerify").onclick = guard(function () {
    return dialer.verifyEmailCode({ challengeId: challengeId, code: $("hlCode").value.trim() });
  });
  $("hlResend").onclick = guard(function () {
    return dialer.resendEmailCode(challengeId);
  });
  $("hlCall").onclick = guard(function () {
    var cfg = readForm();
    return dialer.call({
      to: $("hlTo").value.trim(),
      callerIdId: $("hlCallerId").value || undefined,
      externalContactId: cfg.cExt || undefined,
    });
  });
  $("hlMute").onclick = guard(function () { return dialer.mute(); });
  $("hlUnmute").onclick = guard(function () { return dialer.unmute(); });
  $("hlHold").onclick = guard(function () { return dialer.hold(); });
  $("hlResume").onclick = guard(function () { return dialer.resume(); });
  $("hlDtmf").onclick = guard(function () { return dialer.sendDigits("1"); });
  $("hlHangup").onclick = guard(function () { return dialer.hangup(); });
  $("hlSignout").onclick = guard(function () {
    if (dialer) return dialer.signOut();
  });

  // Floating panel handlers
  $("openBtn").onclick = function () { controller && controller.open && controller.open(); };
  $("closeBtn").onclick = function () { controller && controller.close && controller.close(); };
  $("toggleBtn").onclick = function () { controller && controller.toggle && controller.toggle(); };

  // Contact handlers (Floating + Bar)
  $("setContactBtn").onclick = function () {
    var cfg = readForm();
    persist(cfg);
    var c = currentContact(cfg);
    if (controller && controller.setContact) {
      controller.setContact(c);
      log("setContact(" + (c ? c.number || c.name : "null") + ")");
    } else {
      log("setContact solo aplica a Floating/Bar (montá uno).", "ev-err");
    }
  };
  $("prefillBtn").onclick = function () {
    var n = $("cNumber").value.trim();
    if (controller && controller.prefill) {
      controller.prefill(n);
      log("prefill(" + n + ")");
    } else {
      log("prefill solo aplica a Floating/Bar (montá uno).", "ev-err");
    }
  };
  $("startCallBtn").onclick = function () {
    var cfg = readForm();
    if (controller && controller.startCall) {
      controller.startCall({
        to: cfg.cNumber,
        name: cfg.cName || undefined,
        externalContactId: cfg.cExt || undefined,
      });
      log("startCall(" + cfg.cNumber + ")");
    } else {
      log("startCall solo aplica a Floating (montá Floating).", "ev-err");
    }
  };

  // ── Sidebar buttons ──────────────────────────────────────────────────────
  $("mountBtn").onclick = mount;
  $("resetBtn").onclick = function () {
    try { localStorage.removeItem(STORE_KEY); } catch (_) {}
    teardown();
    var fresh = loadConfig();
    fresh.pk = ""; // don't re-inject stored pk after a reset
    writeForm(fresh);
    log("Config reseteada.");
  };
  $("shareBtn").onclick = function () {
    var url = shareUrl(readForm());
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        function () { log("Enlace copiado al portapapeles.", "ev-ok"); },
        function () { log("No se pudo copiar; enlace: " + url); }
      );
    } else {
      log("Enlace: " + url);
    }
  };

  // Persist edits as the user types.
  FIELDS.forEach(function (id) {
    var el = $(id === "mode" ? null : id);
    if (!el) return;
    var ev = el.type === "checkbox" ? "change" : "input";
    el.addEventListener(ev, function () { persist(readForm()); });
  });

  // ── Boot ─────────────────────────────────────────────────────────────────
  var initial = loadConfig();
  writeForm(initial);
  $("originHint").innerHTML =
    "Este origen (<code>" +
    escapeHtml(window.location.origin) +
    "</code>) debe estar en <code>allowedOrigins</code> de tu publishable key.";

  // Auto-mount when a pk is already available (shared link / env default),
  // so the page is immediately live without an extra click.
  if (initial.pk) {
    log("pk detectada — montando automáticamente.");
    // Defer so the SDK global is fully ready.
    setTimeout(mount, 0);
  } else {
    $("stageHint").style.display = "block";
    log("Pegá tu pk_live_… y hacé clic en “Montar / Aplicar”.");
  }
})();

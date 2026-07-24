/* Клиентский пароль-экран для дашборда.
   ВАЖНО: это обфускация от случайных зевак, НЕ настоящая защита — data/*.json
   и исходники остаются публично доступны по прямой ссылке; технически подкованный обойдёт.
   Пароль по умолчанию: нольошибок  — в коде лежит SHA-256, не сам пароль.
   Сменить: посчитать sha256 нового пароля и заменить HASH ниже (или попросить Клода). */
(function () {
  var HASH = "fed0f089fdfeebd1ef8fe8adf11a5491dcf40075ec5902e019517df7b2611500";
  var KEY = "oc_dash_auth_v1";
  try { if (localStorage.getItem(KEY) === HASH) return; } catch (e) {}

  var css = [
    "body>*:not(#ocgate){display:none!important}",
    "#ocgate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;",
    "background:radial-gradient(120% 120% at 50% 0%,#12332e 0%,#0b1a18 60%,#070f0e 100%);",
    "font:15px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#e8ecea}",
    "#ocgate .box{background:#12181c;border:1px solid #263038;border-radius:16px;padding:26px 24px;",
    "width:min(340px,90vw);box-shadow:0 20px 60px #0009;text-align:center}",
    "#ocgate .emo{font-size:34px}",
    "#ocgate h2{font:600 18px ui-serif,Georgia,serif;margin:10px 0 2px;color:#f1f5f3}",
    "#ocgate p{font-size:12.5px;color:#8b948f;margin:0 0 16px}",
    "#ocgate input{width:100%;box-sizing:border-box;font:inherit;font-size:15px;text-align:center;",
    "background:#0c1113;border:1px solid #2a3138;border-radius:10px;padding:11px 12px;color:#e8ecea;outline:none}",
    "#ocgate input:focus{border-color:#10a395}",
    "#ocgate button{width:100%;margin-top:10px;font:inherit;font-weight:650;font-size:14px;cursor:pointer;",
    "background:#10a395;border:0;border-radius:10px;padding:11px;color:#06110f}",
    "#ocgate button:hover{background:#13b8a8}",
    "#ocgate .err{color:#f87171;font-size:12px;min-height:16px;margin-top:8px}"
  ].join("");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function sha(s) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) {
        return ("0" + x.toString(16)).slice(-2);
      }).join("");
    });
  }
  function mount() {
    var o = document.createElement("div");
    o.id = "ocgate";
    o.innerHTML =
      '<div class="box"><div class="emo">📊🔒</div>' +
      '<h2>Overchat · аналитика</h2>' +
      '<p>Приватный дашборд. Введи пароль.</p>' +
      '<input id="ocpw" type="password" autocomplete="off" placeholder="пароль">' +
      '<button id="ocgo">Открыть</button>' +
      '<div class="err" id="ocerr"></div></div>';
    document.body.appendChild(o);
    var inp = o.querySelector("#ocpw"), err = o.querySelector("#ocerr");
    function tryit() {
      sha((inp.value || "").trim()).then(function (h) {
        if (h === HASH) {
          try { localStorage.setItem(KEY, HASH); } catch (e) {}
          st.remove(); o.remove();
        } else {
          err.textContent = "Неверный пароль";
          inp.value = ""; inp.focus();
        }
      });
    }
    o.querySelector("#ocgo").addEventListener("click", tryit);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") tryit(); });
    inp.focus();
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();

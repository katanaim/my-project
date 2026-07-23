/**
 * Overchat · Дневной монитор воронки — автообновление данных (инкрементальное).
 *
 * Раз в сутки:
 *  1) пересчитывает в BigQuery последние RECOMPUTE_DAYS зрелых дней (буфер BUFFER_DAYS
 *     от сегодня — GA4-экспорт лагает) и ПОДШИВАЕТ их к накопленной истории;
 *  2) коммитит в GitHub:
 *       dashboard/data/funnel_daily.json      — воронка по дням (история с HISTORY_START)
 *       dashboard/data/purchases_events.json  — события покупок по юзерам (анонимно, для
 *                                               пересчёта повторов/апгрейдов под любой диапазон дат)
 * Страница dashboard/index.html читает файлы и даёт выбирать период — всё пересчитывается на клиенте.
 *
 * Первый запуск (файлов ещё нет) делает полный бэкфилл с HISTORY_START — это один большой
 * запрос; дальше ежедневно сканируются только последние ~16 дней.
 *
 * Установка — см. dashboard/README.md.
 */

var CFG = {
  BQ_PROJECT: 'zinc-hour-447409-k5',
  GH_REPO: 'katanaim/my-project',          // owner/repo
  GH_BRANCH: 'master',                      // куда коммитить данные (дефолтная ветка репо)
  PATH_DAILY: 'dashboard/data/funnel_daily.json',
  PATH_PURCH: 'dashboard/data/purchases_events.json',
  HISTORY_START: '2026-01-22',              // с какого дня копим историю (~полгода)
  RECOMPUTE_DAYS: 14,                       // сколько последних зрелых дней пересчитывать каждый прогон
  BUFFER_DAYS: 2,                           // последние N дней не берём (лаг экспорта)
  CHUNK_DAYS: 30,                           // размер куска бэкфилла (лимит Apps Script — 6 мин/запуск)
  CHUNK_LOOKAHEAD: 7,                       // при бэкфилле сканим +N дней вперёд, чтобы дозрели нижние шаги
  COHORT_LOOKBACK: 14                       // сканим N дней НАЗАД от диапазона: возвращённец не считается новой когортой
};

// ---------------------------------------------------------------------------
// Тест-юзеры (источник правды — Лиза; при добавлении новых аккаунтов дополнять)
var EXCLUDED_IDS = [
  '3f660b7b-eed6-4a7f-bc42-1deb6d661f92','95121354-86d2-467e-ae4e-594c206ce712',
  'b6e2b67a-6dae-4983-af05-dfcd9e308b70','84dd3ea3-32f3-4f3a-a988-0e8b5cc5785a',
  '33459694-b9bb-4be5-b861-fc8d781ae43e','d4ad1190-b206-4fba-a346-0b82e8424ee3',
  'fc91c9fc-f6f1-4389-b89f-6e69c3416a8d','8eefe93b-1b56-488c-8d0a-11d052590946',
  '7b552b11-79eb-4216-8dcc-8fc81807cb29','109b2b7e-a7d0-4752-8eac-7d4c1d714c43',
  '448cc757-97c3-41c8-87fd-59b9c9599879','3d7c65b5-7ff5-4aa2-a5cd-d022004e3bb9',
  'b9d2d800-cd4c-4dfe-8d7c-e8fbee0572a4','8d6a56c8-c51f-49d5-afb5-56ede7101338',
  '006dbf43-2f8c-4f1e-875e-62e41f34a38f','5b6e25cb-9fab-4f63-a5d6-d3341a4d2b69',
  '95f19c8d-892d-4942-8f90-076ebbf87650','1e44618c-72a5-4888-87fd-d3617e632505',
  'c1dd0080-ffe5-47a5-8dcd-3131da76d712','52de69a5-8fa4-429a-a129-208fd871a576',
  '576c352e-c7f6-4806-b450-eeb47be072b6','da2b3e9d-daf9-4793-91e5-9134cfcc9520',
  '3409159a-1bce-4088-b13b-08ac7ee26769','4545cb85-8d15-4abe-8f21-5e0f46eda953',
  '08d96883-f1fe-487d-a5ad-2f245204661a','10c3c0fb-3548-4761-b0bc-ad182d4188dc',
  'ff33f9e8-df8d-4694-b557-57e44047a056','1cc23996-24b0-46c6-9014-0981fb601b08',
  '9bcbdad1-d586-4224-bf1a-de1a29d29ada','9b9e5219-ef22-4674-ae44-74e58d46c138',
  '2af75b8e-9960-4b47-b905-6da11979f735','a783cc24-51cd-46fe-930e-5d89bd24b312',
  '17c27526-4b43-453b-915c-88f11cd0daa7','9892bba8-be74-411f-9521-7df1d16c8081',
  '6a30fe24-2574-484f-ac9f-cc85a6223991','d12a6fba-5bcd-447b-9122-23c3fc11e3b5',
  'b832d021-bdfd-492c-b96d-c731edb39ff6','adebd97a-5368-468d-8241-4434eba0b93e',
  '76ed8c83-2759-477b-ae83-6f8c9510ffa4','473d51a1-5420-4a4c-8305-60d34a136634',
  'b9b0a844-8add-4943-9756-b548f6ed47db','fd44501a-05ed-4742-9b37-347e60f806d7',
  'eec6bcc7-a013-4db9-a58c-fc7fa868623a','1cf155a0-0389-4d41-aab3-ffc86fe65a34',
  'e080acaf-41fc-4442-81ae-e658309d3d61','1ff3966e-dd84-41f1-bf00-a4eda726b794',
  '1d8ebef3-f1d0-4137-be8d-4df5ee37a9d3','60cc53fa-d2eb-4fe8-a008-743822d1bf87',
  '1d57c7dd-6801-4d1d-8db5-4976dba8d1d3','e1da9b04-87e4-4c1e-9cf8-02fb16a152a7'
];

// --- даты (всё в UTC) -------------------------------------------------------
function addDays_(d, n){ return new Date(d.getTime() + n*86400000); }
function ymd_(d){ return Utilities.formatDate(d, 'UTC', 'yyyyMMdd'); }
function iso_(d){ return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'); }
function parseIso_(s){ var p=s.split('-'); return new Date(Date.UTC(+p[0], +p[1]-1, +p[2])); }

function excludedCte_(loYmd, hiYmd) {
  return "excluded_users AS (\n" +
    "  SELECT DISTINCT user_pseudo_id\n" +
    "  FROM `" + CFG.BQ_PROJECT + ".analytics_469242162.events_*`\n" +
    "  WHERE _TABLE_SUFFIX BETWEEN '" + loYmd + "' AND '" + hiYmd + "'\n" +
    "    AND user_id IN ('" + EXCLUDED_IDS.join("','") + "')\n" +
    ")";
}

// --- SQL 1: воронка по дням (вложенная; когорта = первый визит лендинга В ОКНЕ скана) ---
function dailySql_(loYmd, hiYmd) {
  return "WITH " + excludedCte_(loYmd, hiYmd) + "\n" +
", raw AS (\n" +
"  SELECT user_pseudo_id, event_timestamp AS ts, event_name,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='eventCategory') AS cat,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='eventAction')   AS act,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='eventLabel')    AS lab,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') AS pl\n" +
"  FROM `" + CFG.BQ_PROJECT + ".analytics_469242162.events_*`\n" +
"  WHERE _TABLE_SUFFIX BETWEEN '" + loYmd + "' AND '" + hiYmd + "'\n" +
"    AND user_pseudo_id NOT IN (SELECT user_pseudo_id FROM excluded_users)\n" +
"    AND IFNULL(device.web_info.hostname,'') NOT IN ('stage.overchat.ai','widget.overchat.ai')\n" +
"    AND NOT EXISTS(SELECT 1 FROM UNNEST(event_params) WHERE key='test_user')\n" +
")\n" +
", base AS (\n" +
"  SELECT user_pseudo_id, ts, step FROM (\n" +
"    SELECT user_pseudo_id, ts,\n" +
"      CASE\n" +
"        WHEN event_name='page_view'\n" +
"             AND REGEXP_CONTAINS(pl, r'overchat\\.ai/(?:[a-z]{2}(?:-[a-z]{2})?/)?(?:image|video|text|chat|models)/') THEN 'landing'\n" +
"        WHEN event_name='page_view' AND pl LIKE '%/web/%' THEN 'product'\n" +
"        -- 'get stars view' = ЛЕГАСИ-имя рег-попапа до ~середины июня 2026 (rename), НЕ пейволл\n" +
"        WHEN event_name='overchat' AND cat='chat' AND act='pop-up' AND lab IN ('sign up view','get stars view') THEN 'reg_popup'\n" +
"        WHEN event_name='overchat' AND cat='login' AND act='registration' THEN 'registration'\n" +
"        WHEN event_name='overchat' AND cat='chat' AND act='pop-up'\n" +
"             AND lab IN ('get feature view','credits paywall view') THEN 'paywall'\n" +
"        WHEN (event_name='purchase_onetime' AND DATE(TIMESTAMP_MICROS(ts)) NOT IN ('2026-06-06','2026-06-07','2026-06-08'))\n" +
"             OR (event_name='overchat' AND cat='purchase' AND lab='package-onetime')\n" +
"             OR event_name IN ('purchase_apple_package-onetime','purchase_google_package-onetime') THEN 'buy_onetime'\n" +
"        WHEN event_name='subscription_started'\n" +
"             OR (event_name='overchat' AND cat='purchase' AND lab LIKE 'pro_%') THEN 'buy_sub'\n" +
"        -- флуд фейковых purchase-событий 06-08.06.2026 вырезан; исторический (до июня) карт-поток ловим universal/зонтиком\n" +
"        WHEN (event_name IN ('purchase','purchase_universal') AND DATE(TIMESTAMP_MICROS(ts)) NOT IN ('2026-06-06','2026-06-07','2026-06-08'))\n" +
"             OR (event_name='overchat' AND cat='purchase') THEN 'buy_other'\n" +
"      END AS step\n" +
"    FROM raw\n" +
"  )\n" +
"  WHERE step IS NOT NULL\n" +
")\n" +
", s1 AS (SELECT user_pseudo_id, MIN(ts) t1 FROM base WHERE step='landing' GROUP BY 1)\n" +
", s2 AS (SELECT b.user_pseudo_id, MIN(b.ts) t2 FROM base b JOIN s1 USING(user_pseudo_id) WHERE b.step='product'      AND b.ts>s1.t1 GROUP BY 1)\n" +
// s3 (рег-попап) — СПРАВОЧНАЯ метрика, НЕ звено каскада: его трекинг ломался (09-16.07) и переименовывался (get stars → sign up)
", s3 AS (SELECT b.user_pseudo_id, MIN(b.ts) t3 FROM base b JOIN s2 USING(user_pseudo_id) WHERE b.step='reg_popup'    AND b.ts>s2.t2 GROUP BY 1)\n" +
// рега цепляется к ПРОДУКТУ (s2), не к попапу — login/registration стабилен всю историю
", s4 AS (SELECT b.user_pseudo_id, MIN(b.ts) t4 FROM base b JOIN s2 USING(user_pseudo_id) WHERE b.step='registration' AND b.ts>s2.t2 GROUP BY 1)\n" +
", s5 AS (SELECT b.user_pseudo_id, MIN(b.ts) t5 FROM base b JOIN s4 USING(user_pseudo_id) WHERE b.step='paywall'      AND b.ts>s4.t4 GROUP BY 1)\n" +
", s6 AS (SELECT b.user_pseudo_id, MIN(b.ts) t6 FROM base b JOIN s5 USING(user_pseudo_id) WHERE b.step IN ('buy_onetime','buy_sub') AND b.ts>s5.t5 GROUP BY 1)\n" +
", s6a AS (SELECT b.user_pseudo_id, MIN(b.ts) t6a FROM base b JOIN s5 USING(user_pseudo_id) WHERE b.step='buy_onetime' AND b.ts>s5.t5 GROUP BY 1)\n" +
", s6b AS (SELECT b.user_pseudo_id, MIN(b.ts) t6b FROM base b JOIN s5 USING(user_pseudo_id) WHERE b.step='buy_sub'     AND b.ts>s5.t5 GROUP BY 1)\n" +
", pu AS (\n" +
"  SELECT s1.user_pseudo_id, DATE(TIMESTAMP_MICROS(s1.t1)) AS landing_day,\n" +
"    s2.t2, s3.t3, s4.t4, s5.t5, s6.t6, s6a.t6a, s6b.t6b\n" +
"  FROM s1\n" +
"  LEFT JOIN s2 USING(user_pseudo_id) LEFT JOIN s3 USING(user_pseudo_id)\n" +
"  LEFT JOIN s4 USING(user_pseudo_id) LEFT JOIN s5 USING(user_pseudo_id)\n" +
"  LEFT JOIN s6 USING(user_pseudo_id) LEFT JOIN s6a USING(user_pseudo_id) LEFT JOIN s6b USING(user_pseudo_id)\n" +
")\n" +
"SELECT CAST(landing_day AS STRING) AS landing_day,\n" +
"  COUNT(*) AS landing,\n" +
"  COUNTIF(t2 IS NOT NULL) AS product,\n" +
"  COUNTIF(t3 IS NOT NULL) AS reg_popup,\n" +
"  COUNTIF(t4 IS NOT NULL) AS registration,\n" +
"  COUNTIF(t5 IS NOT NULL) AS paywall,\n" +
"  COUNTIF(t6 IS NOT NULL) AS purchase,\n" +
"  COUNTIF(t6a IS NOT NULL) AS purchase_onetime,\n" +
"  COUNTIF(t6b IS NOT NULL) AS purchase_sub\n" +
"FROM pu GROUP BY landing_day ORDER BY landing_day";
}

// --- SQL 2: события покупок по юзерам (анонимный хеш + unix-секунды) ---
function purchasesSql_(loYmd, hiYmd) {
  return "WITH " + excludedCte_(loYmd, hiYmd) + "\n" +
", pur AS (\n" +
"  SELECT user_pseudo_id, event_name, event_timestamp AS ts,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='eventCategory') AS cat,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='eventLabel')    AS lab\n" +
"  FROM `" + CFG.BQ_PROJECT + ".analytics_469242162.events_*`\n" +
"  WHERE _TABLE_SUFFIX BETWEEN '" + loYmd + "' AND '" + hiYmd + "'\n" +
"    AND (event_name IN ('purchase_onetime','subscription_started','purchase_apple_package-onetime','purchase_google_package-onetime','overchat')\n" +
"         OR event_name LIKE 'purchase_apple_pro%' OR event_name LIKE 'purchase_google_pro%')\n" +
"    AND user_pseudo_id NOT IN (SELECT user_pseudo_id FROM excluded_users)\n" +
"    AND IFNULL(device.web_info.hostname,'') NOT IN ('stage.overchat.ai','widget.overchat.ai')\n" +
"    AND NOT EXISTS(SELECT 1 FROM UNNEST(event_params) WHERE key='test_user')\n" +
")\n" +
", cls AS (\n" +
"  SELECT user_pseudo_id, ts,\n" +
"    CASE\n" +
"      WHEN (event_name='purchase_onetime' AND DATE(TIMESTAMP_MICROS(ts)) NOT IN ('2026-06-06','2026-06-07','2026-06-08'))\n" +
"           OR (event_name='overchat' AND cat='purchase' AND lab='package-onetime')\n" +
"           OR event_name IN ('purchase_apple_package-onetime','purchase_google_package-onetime') THEN 'o'\n" +
"      WHEN event_name='subscription_started'\n" +
"           OR (event_name='overchat' AND cat='purchase' AND lab LIKE 'pro_%')\n" +
"           OR event_name LIKE 'purchase_apple_pro%' OR event_name LIKE 'purchase_google_pro%' THEN 's'\n" +
"    END AS k\n" +
"  FROM pur\n" +
")\n" +
"SELECT SUBSTR(TO_HEX(MD5(user_pseudo_id)), 1, 12) AS uid,\n" +
"  ARRAY_AGG(IF(k='o', CAST(DIV(ts,1000000) AS INT64), NULL) IGNORE NULLS ORDER BY ts) AS o,\n" +
"  ARRAY_AGG(IF(k='s', CAST(DIV(ts,1000000) AS INT64), NULL) IGNORE NULLS ORDER BY ts) AS s\n" +
"FROM cls WHERE k IS NOT NULL GROUP BY uid";
}

// ---------------------------------------------------------------------------
// BigQuery: выполнить запрос, вернуть массив объектов; REPEATED-поля -> массивы
function bqCell_(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(function (x) { return bqCell_(x.v); });
  if (typeof v === 'object' && 'v' in v) return bqCell_(v.v);
  return (typeof v === 'string' && /^-?\d+$/.test(v)) ? parseInt(v, 10) : v;
}
function bqQuery_(sql) {
  var resp = BigQuery.Jobs.query({ query: sql, useLegacySql: false, timeoutMs: 300000 }, CFG.BQ_PROJECT);
  if (!resp.jobComplete) throw new Error('BQ job не завершился за timeout: ' + JSON.stringify(resp.jobReference));
  var fields = resp.schema.fields.map(function (f) { return f.name; });
  var all = [];
  var collect = function (rows) {
    (rows || []).forEach(function (r) {
      var o = {};
      r.f.forEach(function (c, i) { o[fields[i]] = bqCell_(c.v); });
      all.push(o);
    });
  };
  collect(resp.rows);
  var token = resp.pageToken;
  while (token) { // покупатели за всю историю могут не влезть в одну страницу
    var page = BigQuery.Jobs.getQueryResults(CFG.BQ_PROJECT, resp.jobReference.jobId, { pageToken: token });
    collect(page.rows);
    token = page.pageToken;
  }
  return all;
}

// --- GitHub Contents API ----------------------------------------------------
function ghHeaders_() {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Script Property GITHUB_TOKEN не задан');
  return { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}
function ghGetJson_(path) { // -> {json, sha} | null
  var url = 'https://api.github.com/repos/' + CFG.GH_REPO + '/contents/' + path + '?ref=' + CFG.GH_BRANCH;
  var r = UrlFetchApp.fetch(url, { headers: ghHeaders_(), muteHttpExceptions: true });
  if (r.getResponseCode() === 404) return null;
  if (r.getResponseCode() !== 200) throw new Error('GitHub GET ' + path + ': ' + r.getResponseCode() + ' ' + r.getContentText());
  var body = JSON.parse(r.getContentText());
  var text = Utilities.newBlob(Utilities.base64Decode(body.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
  return { json: JSON.parse(text), sha: body.sha };
}
function ghPutFile_(path, contentStr, message, sha) {
  var url = 'https://api.github.com/repos/' + CFG.GH_REPO + '/contents/' + path;
  var body = { message: message, branch: CFG.GH_BRANCH, content: Utilities.base64Encode(contentStr, Utilities.Charset.UTF_8) };
  if (sha) body.sha = sha;
  var r = UrlFetchApp.fetch(url, { method: 'put', headers: ghHeaders_(), contentType: 'application/json',
    payload: JSON.stringify(body), muteHttpExceptions: true });
  if (r.getResponseCode() >= 300) throw new Error('GitHub PUT ' + path + ': ' + r.getResponseCode() + ' ' + r.getContentText());
}

// ---------------------------------------------------------------------------
// ЯДРО: пересчитать диапазон [fromDate..toDate] и вшить его в историю.
// Заменяет строки/события ВНУТРИ диапазона, всё остальное не трогает.
// scanToDate (опц.) — досканить дальше toDate, чтобы дозрели нижние шаги; когорты берём только до toDate.
function refreshRange_(fromDate, toDate, scanToDate, label) {
  var stamp = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var fromIso = iso_(fromDate), toIso = iso_(toDate);
  var scanTo = scanToDate || toDate;

  // --- воронка (скан с лукбэком: «первый визит» определяется относительно прошлых 2 недель) ---
  var exDaily = ghGetJson_(CFG.PATH_DAILY);
  var scanFrom = addDays_(fromDate, -CFG.COHORT_LOOKBACK);
  var fresh = bqQuery_(dailySql_(ymd_(scanFrom), ymd_(scanTo)))
    .filter(function (r) { return r.landing_day >= fromIso && r.landing_day <= toIso; });
  if (!fresh.length) throw new Error('Воронка вернула 0 строк за ' + fromIso + '..' + toIso + ' — не коммичу');
  var oldRows = (exDaily && exDaily.json.rows) || [];
  var rows = oldRows.filter(function (r) { return r.landing_day < fromIso || r.landing_day > toIso; }).concat(fresh);
  rows.sort(function (a, b) { return a.landing_day < b.landing_day ? -1 : 1; });
  // защита от дублей дня (краевые частичные когорты из старых прогонов): оставляем строку с бОльшим landing
  var byDay = {};
  rows.forEach(function (r) { if (!byDay[r.landing_day] || r.landing > byDay[r.landing_day].landing) byDay[r.landing_day] = r; });
  rows = Object.keys(byDay).sort().map(function (k) { return byDay[k]; });
  var dailyJson = { generated_at: stamp, history_start: CFG.HISTORY_START,
    window: { from: rows[0].landing_day, to: rows[rows.length - 1].landing_day }, rows: rows };

  // --- покупки: заменить события внутри [fromTs, toTs) ---
  var exPurch = ghGetJson_(CFG.PATH_PURCH);
  var fromTs = Math.floor(fromDate.getTime() / 1000), toTs = Math.floor(addDays_(toDate, 1).getTime() / 1000);
  var outside = function (t) { return t < fromTs || t >= toTs; };
  var map = {};
  ((exPurch && exPurch.json.users) || []).forEach(function (u) {
    map[u.id] = { o: (u.o || []).filter(outside), s: (u.s || []).filter(outside) };
  });
  bqQuery_(purchasesSql_(ymd_(fromDate), ymd_(toDate))).forEach(function (u) {
    var m = map[u.uid] || (map[u.uid] = { o: [], s: [] });
    m.o = m.o.concat((u.o || []).filter(function (t) { return !outside(t); }));
    m.s = m.s.concat((u.s || []).filter(function (t) { return !outside(t); }));
  });
  var collapse = function (arr) { // схлопнуть мульти-фаер: события юзера ближе 10 мин = одно
    arr.sort(function(a,b){return a-b});
    var out = [];
    arr.forEach(function (t) { if (!out.length || t - out[out.length-1] >= 600) out.push(t); });
    return out;
  };
  var users = Object.keys(map).map(function (id) {
    var m = map[id];
    return { id: id, o: collapse(m.o), s: collapse(m.s) };
  }).filter(function (u) { return u.o.length || u.s.length; });
  var purchJson = { generated_at: stamp, history_start: CFG.HISTORY_START, users: users };

  ghPutFile_(CFG.PATH_DAILY, JSON.stringify(dailyJson, null, 1), 'data: funnel ' + label + ' ' + fromIso + '..' + toIso, exDaily && exDaily.sha);
  ghPutFile_(CFG.PATH_PURCH, JSON.stringify(purchJson), 'data: purchases ' + label + ' ' + fromIso + '..' + toIso, exPurch && exPurch.sha);
  Logger.log('OK %s: %s..%s → %s дней истории, %s покупателей', label, fromIso, toIso, rows.length, users.length);
}


// ---------------------------------------------------------------------------
// ВИДЖЕТЫ ПО ДНЯМ → dashboard/data/widgets_daily.json (страница widgets.html)
// Карта v3 (23.07.2026) — КУРАТОРСКАЯ, не автоматическая: динамический слаг-матчинг
// сверялся с неполным продукт-листом и терял виджеты (style-analysis, tarot-reading,
// пресеты image-generator/* и др.). Правила карты:
//  - продукт-лист построен из ПОЛНОГО трафика /web/ (все страницы >=20 юзеров/28д);
//  - пресеты внутри image-generator / video-generator / ai-video-generator / ai-image-model —
//    отдельные виджеты (2-сегментный pslug); невыделенные подпути падают в родителя (pfam-fallback);
//  - алиасы лендингов подтверждены фактическими переходами юзеров (порог >=70% потока):
//    color-analysis/makeup/hairstyle → style-analysis; tarot-card-reader → tarot-reading;
//    photo-to-sims/gta → sims/gta-trend; twek+text-to-video → ai-video-generator (баг роутинга);
//    skin-enhancer/hair-color/object-remover/... → пресеты image-generator/*;
//  - новые лендинги сами появляются в others → оттуда добавляем в WIDGET_DEFS руками.
var WIDGET_DEFS = [
  { k:'ai-rate-my-face', n:'rate-my-face', l:['rate-my-face'] },
  { k:'looksmax', n:'looksmax', l:['looksmaxing-ai'] },
  { k:'ai-image-combiner', n:'image-combiner', l:['ai-image-combiner'] },
  { k:'ai-baby-face-generator', n:'baby-face-generator', l:['baby-face-generator'] },
  { k:'ai-kissing-generator', n:'kissing-generator', l:['ai-kissing-generator'] },
  { k:'ai-face-swap-video', n:'face-swap-video', l:['face-swap-video','face-swap'] },
  { k:'aspect-ratio-changer', n:'aspect-ratio-changer', l:['aspect-ratio-changer'] },
  { k:'ai-passport-photo', n:'passport-photo', l:['ai-passport-photo'] },
  { k:'ai-add-person-to-photo', n:'add-person-to-photo', l:['add-person-to-photo'] },
  { k:'ai-attractiveness-test', n:'attractiveness-test', l:['ai-attractiveness-test'] },
  { k:'ai-dance-generator', n:'dance-generator', l:['ai-dance-generator'] },
  { k:'ai-video-extender', n:'video-extender', l:['ai-video-extender'] },
  { k:'ai-palm-reading', n:'palm-reading', l:['palm-reading-scanner'] },
  { k:'ai-soulmate', n:'soulmate', l:['ai-soulmate'] },
  { k:'multiple-angles', n:'multiple-angles', l:['multiple-angles'] },
  { k:'ai-face-shape-detector', n:'face-shape-detector', l:['ai-face-shape-detector'] },
  { k:'ai-stadium-trend', n:'stadium-trend', l:['ai-stadium-trend'] },
  { k:'ai-twerk-generator', n:'twerk-generator', l:['ai-twerk-generator','ai-twek-generator'] },
  { k:'image-generator', n:'image-generator', l:['ai-image-generator','ai-pranks'] },
  { k:'ai-selfie-generator', n:'selfie-generator', l:['ai-selfie-generator'] },
  { k:'ai-cartoonizer', n:'cartoonizer', l:['ai-cartoonizer'] },
  { k:'ai-handwriting-check', n:'handwriting-check', l:['ai-handwriting-check'] },
  { k:'ai-video-generator', n:'ai-video-generator', l:['ai-video-generator','text-to-video'] },
  { k:'ai-style-analysis', n:'style-analysis', l:['ai-color-analysis','ai-makeup-generator','ai-hairstyle-changer'] },
  { k:'ai-tarot-reading', n:'tarot-reading', l:['ai-tarot-card-reader'] },
  { k:'ai-sims-2-trend', n:'sims-trend', l:['photo-to-sims-ai'] },
  { k:'ai-gta-trend', n:'gta-trend', l:['photo-to-gta'] },
  { k:'video-generator', n:'video-generator-hub', l:['ai-bikini-generator','tiktok-video-generator'] },
  { k:'ai-image-model', n:'image-models-hub', l:['ai-meme-generator'] },
  { k:'image-generator/ai-skin-enhancer', n:'skin-enhancer', l:['ai-skin-enhancer'] },
  { k:'image-generator/hairstyle-changer', n:'hairstyle-changer', l:['ai-hair-color-changer'] },
  { k:'image-generator/object-removal', n:'object-removal', l:['ai-object-remover'] },
  { k:'image-generator/colorize-image', n:'colorize', l:['colorize-photo'] },
  { k:'image-generator/unblur-ai', n:'unblur', l:['unblur-image','ai-sharpen-photo'] },
  { k:'image-generator/old-photo-restoration', n:'photo-restoration', l:['ai-photo-restoration'] },
  { k:'image-generator/ai-action-figure', n:'action-figure', l:['ai-action-figure-generator'] },
  { k:'image-generator/video-upscaler', n:'video-upscaler', l:['ai-video-upscaler'] },
  { k:'image-generator/edit-images', n:'photo-editor', l:['ai-photo-editor'] },
  { k:'image-generator/baby-face-filter-image', n:'baby-filter', l:['baby-filter'] },
  { k:'video-generator/Faceless-Reels', n:'faceless-reels', l:['faceless-reels'] },
  { k:'TikTok-Dance-2', n:'tiktok-dance-2', l:[] },
  { k:'ai-skin-analyzer', n:'skin-analyzer', l:[] },
  { k:'ai-hug-generator', n:'hug-generator', l:[] },
  { k:'ai-smile-generator', n:'smile-generator', l:[] },
  { k:'ai-detector', n:'ai-detector', l:[] },
  { k:'ai-humanizer', n:'humanizer', l:[] },
  { k:'ai-family-photo-generator', n:'family-photo-generator', l:[] },
  { k:'ai-pet-portrait-generator', n:'pet-portrait-generator', l:[] },
  { k:'ai-bank-statement-analyzer', n:'bank-statement-analyzer', l:[] },
  { k:'ai-hair-color-changer', n:'hair-color-changer', l:[] },
  { k:'ai-paraphraser', n:'paraphraser', l:[] },
  { k:'ai-girl-generator', n:'girl-generator', l:[] },
  { k:'ai-email-generator', n:'email-generator', l:[] }
];
function widgetsMapCte_() {
  var lrows = [], prows = [];
  WIDGET_DEFS.forEach(function (w) {
    w.l.forEach(function (l) { lrows.push("STRUCT('" + l + "' AS l,'" + w.k + "' AS w)"); });
    prows.push("STRUCT('" + w.k + "' AS p,'" + w.k + "' AS w)");
  });
  return "lmap AS (SELECT * FROM UNNEST([" + lrows.join(',') + "])),\n" +
         "pmap AS (SELECT * FROM UNNEST([" + prows.join(',') + "]))";
}
function widgetsBaseCte_(loYmd, hiYmd) {
  return ", wbase AS (SELECT user_pseudo_id, event_timestamp AS ts, event_name,\n" +
"    CAST(DATE(TIMESTAMP_MICROS(event_timestamp)) AS STRING) AS d,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') AS pl\n" +
"  FROM `" + CFG.BQ_PROJECT + ".analytics_469242162.events_*`\n" +
"  WHERE _TABLE_SUFFIX BETWEEN '" + loYmd + "' AND '" + hiYmd + "'\n" +
"    AND event_name IN ('page_view','purchase_onetime','subscription_started')\n" +
"    AND user_pseudo_id NOT IN (SELECT user_pseudo_id FROM excluded_users)\n" +
"    AND IFNULL(device.web_info.hostname,'') NOT IN ('stage.overchat.ai','widget.overchat.ai')\n" +
"    AND NOT EXISTS(SELECT 1 FROM UNNEST(event_params) WHERE key='test_user')\n" +
"    AND NOT (event_name != 'page_view' AND DATE(TIMESTAMP_MICROS(event_timestamp)) IN ('2026-06-06','2026-06-07','2026-06-08')))\n" +
", wev AS (SELECT wbase.*,\n" +
"    COALESCE(REGEXP_EXTRACT(pl, r'overchat[.]ai/(?:image|video|text|chat|models)/([^/?#]+)'),'~') AS lslug,\n" +
"    COALESCE(REGEXP_EXTRACT(pl, r'overchat[.]ai/web/((?:image-generator|video-generator|ai-video-generator|ai-image-model)/[^/?#]+|[^/?#]+)'),'~') AS pslug FROM wbase)\n" +
", wev2 AS (SELECT *, REGEXP_EXTRACT(pslug, r'^([^/]+)') AS pfam FROM wev)";
}
function widgetsDailySql_(mapLo, mapHi, lo, hi) {
  return "WITH " + excludedCte_(mapLo, mapHi) + ",\n" + widgetsMapCte_() +
  widgetsBaseCte_(lo, hi) + "\n" +
", tl AS (SELECT lm.w AS wkey, e.d, e.user_pseudo_id, TRUE AS iv, FALSE AS io, FALSE AS isb\n" +
"    FROM wev2 e JOIN lmap lm ON e.lslug=lm.l WHERE e.event_name='page_view')\n" +
", tp AS (SELECT COALESCE(pm.w, pf.w) AS wkey, e.d, e.user_pseudo_id, FALSE AS iv,\n" +
"    e.event_name='purchase_onetime' AS io, e.event_name='subscription_started' AS isb\n" +
"    FROM wev2 e\n" +
"    LEFT JOIN pmap pm ON e.pslug=pm.p\n" +
"    LEFT JOIN pmap pf ON pm.p IS NULL AND e.pfam=pf.p\n" +
"    WHERE e.event_name IN ('purchase_onetime','subscription_started') AND COALESCE(pm.w,pf.w) IS NOT NULL)\n" +
", pu AS (SELECT wkey, d, user_pseudo_id, LOGICAL_OR(iv) AS v, LOGICAL_OR(io) AS o, LOGICAL_OR(isb) AS s\n" +
"    FROM (SELECT * FROM tl UNION ALL SELECT * FROM tp) GROUP BY 1,2,3)\n" +
"SELECT wkey, d, COUNTIF(v) AS v, COUNTIF(o OR s) AS b, COUNTIF(o) AS o, COUNTIF(s) AS s\n" +
"FROM pu GROUP BY 1,2";
}
function widgetsCohSql_(mapLo, mapHi, scanLo, hi, cohLo) {
  return "WITH " + excludedCte_(mapLo, mapHi) + ",\n" + widgetsMapCte_() +
  widgetsBaseCte_(scanLo, hi) + "\n" +
", firstot AS (SELECT user_pseudo_id, ARRAY_AGG(STRUCT(pslug, ts, d) ORDER BY ts LIMIT 1)[OFFSET(0)] AS f\n" +
"  FROM wev2 WHERE event_name='purchase_onetime' GROUP BY 1)\n" +
", subs AS (SELECT user_pseudo_id, MIN(ts) AS sub_ts FROM wev2 WHERE event_name='subscription_started' GROUP BY 1)\n" +
", fo2 AS (SELECT fo.user_pseudo_id, fo.f, COALESCE(pm.w, pf.w) AS wkey FROM firstot fo\n" +
"    LEFT JOIN pmap pm ON fo.f.pslug=pm.p\n" +
"    LEFT JOIN pmap pf ON pm.p IS NULL AND REGEXP_EXTRACT(fo.f.pslug, r'^([^/]+)')=pf.p)\n" +
"SELECT fo.wkey, fo.f.d AS d, COUNT(DISTINCT fo.user_pseudo_id) AS c,\n" +
"  COUNT(DISTINCT IF(s.sub_ts IS NOT NULL AND s.sub_ts > fo.f.ts AND s.sub_ts <= fo.f.ts + 7*86400*1000000, fo.user_pseudo_id, NULL)) AS u,\n" +
"  COUNT(DISTINCT IF(s.sub_ts IS NOT NULL AND s.sub_ts > fo.f.ts, fo.user_pseudo_id, NULL)) AS w\n" +
"FROM fo2 fo\n" +
"LEFT JOIN subs s ON s.user_pseudo_id = fo.user_pseudo_id\n" +
"WHERE fo.wkey IS NOT NULL AND (s.sub_ts IS NULL OR s.sub_ts > fo.f.ts) AND fo.f.d >= '" + cohLo + "'\n" +
"GROUP BY 1,2";
}
function widgetsOthersSql_(mapLo, mapHi, lo, hi) {
  return "WITH " + excludedCte_(mapLo, mapHi) + ",\n" + widgetsMapCte_() +
  widgetsBaseCte_(lo, hi) + "\n" +
"SELECT e.lslug AS wkey, e.d, COUNT(DISTINCT e.user_pseudo_id) AS v\n" +
"FROM wev2 e LEFT JOIN lmap m ON e.lslug = m.l\n" +
"WHERE e.event_name='page_view' AND e.lslug != '~' AND m.l IS NULL\n" +
"GROUP BY 1,2 HAVING v >= 5";
}
function buildWidgetsDaily_() {
  var stamp = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var mature = addDays_(new Date(), -CFG.BUFFER_DAYS);
  var startDate = parseIso_('2026-06-01');
  var cap = addDays_(mature, -89);
  if (cap > startDate) startDate = cap;               // держим окно не длиннее 90 дней
  var lo = ymd_(startDate), hi = ymd_(mature);
  var scanLo = ymd_(addDays_(startDate, -14));
  // окно поиска pseudo_id исключённых юзеров = всё окно данных (иначе ранние девайсы не отсекаются)
  var mapLo = scanLo, mapHi = hi;

  var dates = [];
  for (var dcur = new Date(startDate); dcur <= mature; dcur = addDays_(dcur, 1)) dates.push(iso_(dcur));
  var di = {}; dates.forEach(function (d, i) { di[d] = i; });

  function zeros(){ return dates.map(function(){ return 0; }); }
  var W = {};
  WIDGET_DEFS.forEach(function (def) {   // все виджеты карты присутствуют всегда, даже с нулями
    W[def.k] = { key: def.k, name: def.n, landings: def.l.slice(),
      v: zeros(), b: zeros(), o: zeros(), s: zeros(), c: zeros(), u: zeros(), w: zeros() };
  });

  bqQuery_(widgetsDailySql_(mapLo, mapHi, lo, hi)).forEach(function (r) {
    var x = W[r.wkey]; if (!x) return;
    var i = di[r.d]; if (i == null) return;
    x.v[i] = r.v; x.b[i] = r.b; x.o[i] = r.o; x.s[i] = r.s;
  });
  bqQuery_(widgetsCohSql_(mapLo, mapHi, scanLo, hi, dates[0])).forEach(function (r) {
    if (!W[r.wkey]) return;
    var i = di[r.d]; if (i == null) return;
    W[r.wkey].c[i] = r.c; W[r.wkey].u[i] = r.u; W[r.wkey].w[i] = r.w;
  });
  var O = {};
  bqQuery_(widgetsOthersSql_(mapLo, mapHi, lo, hi)).forEach(function (r) {
    if (!O[r.wkey]) O[r.wkey] = zeros();
    var i = di[r.d]; if (i != null) O[r.wkey][i] = r.v;
  });

  var out = { generated_at: stamp, dates: dates,
    mature_cohort_to: iso_(addDays_(mature, -8)),
    widgets: Object.keys(W).map(function (k) { return W[k]; }),
    others: Object.keys(O).map(function (k) { return { slug: k, v: O[k] }; }) };
  var ex = ghGetJson_('dashboard/data/widgets_daily.json');
  ghPutFile_('dashboard/data/widgets_daily.json', JSON.stringify(out), 'data: widgets daily refresh', ex && ex.sha);
  Logger.log('widgets daily: %s виджетов, %s прочих, %s дней', out.widgets.length, out.others.length, dates.length);
}

// ---------------------------------------------------------------------------
// ДЕТАЛКА ВИДЖЕТА looksmax → dashboard/data/widget_looksmax.json (widget.html?w=looksmax)
// Полный внутренний трекинг виджета существует с 2026-07-03 (перезапуск looksmax).
var LM_TRACK_FROM = '2026-07-03';
var LM_TRANS_MAP = {   // куда ведёт каждый кросс-промо клик
  'promo:rate-my-face': ['rate-my-face', 'ai-rate-my-face', 'модалка'],
  'promo:ai-soulmate': ['soulmate', 'ai-soulmate', 'модалка'],
  'promo:style-analysis-color': ['style-analysis: color', 'ai-style-analysis', 'модалка'],
  'promo:style-analysis-makeup': ['style-analysis: makeup', 'ai-style-analysis', 'модалка'],
  'promo:style-analysis-hairstyle': ['style-analysis: hairstyle', 'ai-style-analysis', 'модалка'],
  'promo:style-analysis-style': ['style-analysis: style', 'ai-style-analysis', 'модалка'],
  'promo:browse-catalog': ['каталог', '', 'модалка'],
  'report:Hairstyle': ['style-analysis: hairstyle', 'ai-style-analysis', 'отчёт'],
  'report:Makeup': ['style-analysis: makeup', 'ai-style-analysis', 'отчёт'],
  'report:Color Analysis': ['style-analysis: color', 'ai-style-analysis', 'отчёт'],
  'report:Hair Color': ['hair-color-changer', 'ai-hair-color-changer', 'отчёт'],
  'report:Style Analysis': ['style-analysis', 'ai-style-analysis', 'отчёт'],
  'report:Face Shape': ['face-shape-detector', 'ai-face-shape-detector', 'отчёт'],
  'report:Skin Analyzer': ['skin-analyzer', 'ai-skin-analyzer', 'отчёт']
};
function lmBaseCte_(loYmd, hiYmd) {
  return ", lmbase AS (SELECT user_pseudo_id, event_timestamp AS ts, event_name,\n" +
"    IF(device.category='mobile','m','d') AS dv,\n" +
"    CAST(DATE(TIMESTAMP_MICROS(event_timestamp)) AS STRING) AS d,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='eventCategory') AS cat,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='eventAction') AS act,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='eventLabel') AS lbl,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') AS pl,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_referrer') AS ref\n" +
"  FROM `" + CFG.BQ_PROJECT + ".analytics_469242162.events_*`\n" +
"  WHERE _TABLE_SUFFIX BETWEEN '" + loYmd + "' AND '" + hiYmd + "'\n" +
"    AND user_pseudo_id NOT IN (SELECT user_pseudo_id FROM excluded_users)\n" +
"    AND IFNULL(device.web_info.hostname,'') NOT IN ('stage.overchat.ai','widget.overchat.ai')\n" +
"    AND NOT (event_name LIKE 'purchase%' AND DATE(TIMESTAMP_MICROS(event_timestamp)) IN ('2026-06-06','2026-06-07','2026-06-08'))\n" +
"    AND NOT (event_name='subscription_started' AND DATE(TIMESTAMP_MICROS(event_timestamp)) IN ('2026-06-06','2026-06-07','2026-06-08')))";
}
function lmMetricsSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + "\n" +
", m AS (SELECT d, dv, user_pseudo_id, CASE\n" +
"  WHEN event_name='page_view' AND REGEXP_CONTAINS(pl, r'overchat[.]ai/(?:image|video|text|chat|models)/looksmaxing-ai([/?#]|$)') THEN 'land'\n" +
"  WHEN event_name='page_view' AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/looksmax([/?#]|$)') THEN 'prod'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act='funnel-step-view' AND lbl='scan' THEN 'quiz_scan'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act='funnel-step-view' THEN 'quiz_start'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act='photo-upload' AND lbl='front' THEN 'photo_front'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act='photo-upload' AND lbl='side' THEN 'photo_side'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act='generate-click' THEN 'gen'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act='auth-wall-show' THEN 'wall'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act='scan-complete' AND lbl='success' THEN 'scan_ok'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act='report-view' AND lbl='teaser' THEN 'teaser'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act='unlock-tap' THEN 'unlock'\n" +
"  WHEN event_name='overchat' AND cat='chat' AND act='pop-up' AND lbl='get feature view'\n" +
"    AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/looksmax([/?#]|$)') THEN 'pay_view'\n" +
"  WHEN event_name='purchase_onetime' AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/looksmax([/?#]|$)') THEN 'buy_ot'\n" +
"  WHEN event_name='subscription_started' AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/looksmax([/?#]|$)') THEN 'buy_sub'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act='report-view' AND lbl='full' THEN 'full'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act IN ('plan-day-nav','plan-task-toggle','plan-task-expand') THEN 'plan'\n" +
"  WHEN event_name='overchat' AND cat='looksmax' AND act='error-view' THEN 'err'\n" +
"  END AS metric FROM lmbase)\n" +
"SELECT metric, IFNULL(dv,'a') AS dvx, d, COUNT(DISTINCT user_pseudo_id) AS u FROM m WHERE metric IS NOT NULL\n" +
"GROUP BY GROUPING SETS ((metric, dv, d), (metric, d))";
}
function lmQuizSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + "\n" +
"SELECT 'quiz:'||lbl AS metric, IFNULL(dv,'a') AS dvx, d, COUNT(DISTINCT user_pseudo_id) AS u FROM lmbase\n" +
"WHERE event_name='overchat' AND cat='looksmax' AND act='funnel-step-view'\n" +
"GROUP BY GROUPING SETS ((metric, dv, d), (metric, d))\n" +
"UNION ALL\n" +
"SELECT 'unlock:'||lbl, IFNULL(dv,'a'), d, COUNT(DISTINCT user_pseudo_id) FROM lmbase\n" +
"WHERE event_name='overchat' AND cat='looksmax' AND act='unlock-tap'\n" +
"GROUP BY GROUPING SETS ((1, dv, d), (1, d))";
}
function lmRegSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + "\n" +
", wall AS (SELECT user_pseudo_id, d, MIN(ts) AS ts,\n" +
"    ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv FROM lmbase\n" +
"  WHERE event_name='overchat' AND cat='looksmax' AND act='auth-wall-show' GROUP BY 1,2)\n" +
", regs AS (SELECT user_pseudo_id, MIN(ts) AS ts FROM lmbase\n" +
"  WHERE event_name='overchat' AND cat='login' AND act='registration' GROUP BY 1)\n" +
"SELECT IFNULL(w.dv,'a') AS dvx, w.d,\n" +
"  COUNT(DISTINCT IF(r.ts >= w.ts AND r.ts <= w.ts + 86400*1000000, w.user_pseudo_id, NULL)) AS reg_u\n" +
"FROM wall w LEFT JOIN regs r USING(user_pseudo_id)\n" +
"GROUP BY GROUPING SETS ((w.dv, w.d), (w.d))";
}
function lmTransSql_(lo, hi) {
  var t = [];
  Object.keys(LM_TRANS_MAP).forEach(function (s) {
    if (LM_TRANS_MAP[s][1]) t.push("STRUCT('" + s + "' AS src,'" + LM_TRANS_MAP[s][1] + "' AS tp)");
  });
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + "\n" +
", clicks AS (SELECT user_pseudo_id, ts, d, dv, CASE\n" +
"    WHEN cat='looksmax' AND act='more-widget-click' THEN 'report:'||lbl\n" +
"    WHEN cat='looksmax-post-onboarding' AND STARTS_WITH(act,'cta-') THEN 'promo:'||SUBSTR(act,5)\n" +
"  END AS src FROM lmbase WHERE event_name='overchat' AND (\n" +
"    (cat='looksmax' AND act='more-widget-click') OR (cat='looksmax-post-onboarding' AND STARTS_WITH(act,'cta-'))))\n" +
", tgt AS (SELECT * FROM UNNEST([" + t.join(',') + "]))\n" +
", buys AS (SELECT user_pseudo_id, ts, event_name, REGEXP_EXTRACT(pl, r'overchat[.]ai/web/([^/?#]+)') AS pslug\n" +
"  FROM lmbase WHERE event_name IN ('purchase_onetime','subscription_started') AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/'))\n" +
", fc AS (SELECT src, user_pseudo_id, d, MIN(ts) AS ts,\n" +
"    ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv FROM clicks WHERE src IS NOT NULL GROUP BY 1,2,3)\n" +
"SELECT fc.src, IFNULL(fc.dv,'a') AS dvx, fc.d, COUNT(DISTINCT fc.user_pseudo_id) AS u,\n" +
"  COUNT(DISTINCT IF(b.event_name='purchase_onetime' AND b.pslug=t.tp, fc.user_pseudo_id, NULL)) AS bt_ot,\n" +
"  COUNT(DISTINCT IF(b.event_name='subscription_started' AND b.pslug=t.tp, fc.user_pseudo_id, NULL)) AS bt_sub,\n" +
"  COUNT(DISTINCT IF(b.event_name='purchase_onetime' AND b.pslug!='looksmax', fc.user_pseudo_id, NULL)) AS ba_ot,\n" +
"  COUNT(DISTINCT IF(b.event_name='subscription_started' AND b.pslug!='looksmax', fc.user_pseudo_id, NULL)) AS ba_sub\n" +
"FROM fc LEFT JOIN tgt t ON t.src=fc.src\n" +
"LEFT JOIN buys b ON b.user_pseudo_id=fc.user_pseudo_id AND b.ts>fc.ts AND b.ts<=fc.ts+14*86400*1000000\n" +
"GROUP BY GROUPING SETS ((fc.src, fc.dv, fc.d), (fc.src, fc.d))";
}
function lmBuysCte_() {
  return ", lmbuys AS (SELECT user_pseudo_id, ts, event_name, dv FROM lmbase\n" +
"  WHERE event_name IN ('purchase_onetime','subscription_started')\n" +
"    AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/looksmax([/?#]|$)'))";
}
function lmLockBuySql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + lmBuysCte_() + "\n" +
", taps AS (SELECT user_pseudo_id, lbl, d, MIN(ts) AS ts,\n" +
"    ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv FROM lmbase\n" +
"  WHERE event_name='overchat' AND cat='looksmax' AND act='unlock-tap' GROUP BY 1,2,3)\n" +
"SELECT t.lbl, IFNULL(t.dv,'a') AS dvx, t.d, COUNT(DISTINCT IF(b.user_pseudo_id IS NOT NULL, t.user_pseudo_id, NULL)) AS bu\n" +
"FROM taps t LEFT JOIN lmbuys b ON b.user_pseudo_id=t.user_pseudo_id AND b.ts>t.ts AND b.ts<=t.ts+86400*1000000\n" +
"GROUP BY GROUPING SETS ((t.lbl, t.dv, t.d), (t.lbl, t.d))";
}
function lmSrcSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + lmBuysCte_() + "\n" +
", lands AS (SELECT user_pseudo_id, d, MIN(ts) AS ts,\n" +
"    ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv, CASE\n" +
"    WHEN REGEXP_CONTAINS(pl, r'[?&](gclid|gbraid|wbraid|fbclid|ttclid)=')\n" +
"      OR REGEXP_CONTAINS(LOWER(IFNULL(REGEXP_EXTRACT(pl, r'[?&]utm_medium=([^&#]+)'),'')), r'cpc|paid|ppc') THEN 'paid'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'chatgpt|perplexity|claude[.]ai|gemini|copilot') THEN 'ai'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'overchat[.]ai') THEN 'internal'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'tiktok|instagram|facebook|youtube|t[.]co/|reddit|pinterest|vk[.]com') THEN 'social'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'google[.]|bing[.]|yandex|duckduckgo|brave|ecosia|yahoo|ya[.]ru|coccoc|search[.]') THEN 'organic'\n" +
"    WHEN ref IS NULL OR ref='' THEN 'direct' ELSE 'other' END AS ch\n" +
"  FROM lmbase WHERE event_name='page_view'\n" +
"    AND REGEXP_CONTAINS(pl, r'overchat[.]ai/(?:image|video|text|chat|models)/looksmaxing-ai([/?#]|$)')\n" +
"  GROUP BY user_pseudo_id, d, ch)\n" +
"SELECT l.ch, IFNULL(l.dv,'a') AS dvx, l.d, COUNT(DISTINCT l.user_pseudo_id) AS u,\n" +
"  COUNT(DISTINCT IF(b.user_pseudo_id IS NOT NULL, l.user_pseudo_id, NULL)) AS bu\n" +
"FROM lands l LEFT JOIN lmbuys b ON b.user_pseudo_id=l.user_pseudo_id AND b.ts>l.ts AND b.ts<=l.ts+86400*1000000\n" +
"GROUP BY GROUPING SETS ((l.ch, l.dv, l.d), (l.ch, l.d))";
}
// Когорта любимой конверсии по looksmax с разрезом устройства: первая В ЖИЗНИ одноразка на looksmax
function lmCohSql_(scanLo, hi, cohLo) {
  return "WITH " + excludedCte_(scanLo, hi) + lmBaseCte_(scanLo, hi) + "\n" +
", allbuys AS (SELECT user_pseudo_id, ts, event_name, dv,\n" +
"    REGEXP_EXTRACT(pl, r'overchat[.]ai/web/([^/?#]+)') AS pslug\n" +
"  FROM lmbase WHERE event_name IN ('purchase_onetime','subscription_started')\n" +
"    AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/'))\n" +
", firstot AS (SELECT user_pseudo_id, ARRAY_AGG(STRUCT(pslug, ts, dv,\n" +
"    CAST(DATE(TIMESTAMP_MICROS(ts)) AS STRING) AS d) ORDER BY ts LIMIT 1)[OFFSET(0)] AS f\n" +
"  FROM allbuys WHERE event_name='purchase_onetime' GROUP BY 1)\n" +
", subs AS (SELECT user_pseudo_id, MIN(ts) AS sub_ts FROM allbuys WHERE event_name='subscription_started' GROUP BY 1)\n" +
"SELECT IFNULL(fo.f.dv,'a') AS dvx, fo.f.d AS d,\n" +
"  COUNT(DISTINCT fo.user_pseudo_id) AS c,\n" +
"  COUNT(DISTINCT IF(s.sub_ts IS NOT NULL AND s.sub_ts > fo.f.ts, fo.user_pseudo_id, NULL)) AS w\n" +
"FROM firstot fo LEFT JOIN subs s USING(user_pseudo_id)\n" +
"WHERE fo.f.pslug='looksmax' AND (s.sub_ts IS NULL OR s.sub_ts > fo.f.ts) AND fo.f.d >= '" + cohLo + "'\n" +
"GROUP BY GROUPING SETS ((fo.f.dv, fo.f.d), (fo.f.d))";
}
function lmTtbSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + lmBuysCte_() + "\n" +
", firstprod AS (SELECT user_pseudo_id, MIN(ts) AS ts FROM lmbase\n" +
"  WHERE event_name='page_view' AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/looksmax([/?#]|$)') GROUP BY 1)\n" +
", firstbuy AS (SELECT user_pseudo_id, MIN(ts) AS ts,\n" +
"    ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv FROM lmbuys GROUP BY 1)\n" +
"SELECT CAST(DATE(TIMESTAMP_MICROS(fb.ts)) AS STRING) AS d, fb.dv, ROUND((fb.ts-fp.ts)/60000000,1) AS diff_min\n" +
"FROM firstbuy fb JOIN firstprod fp USING(user_pseudo_id) WHERE fb.ts >= fp.ts";
}
function buildWidgetLooksmax_() {
  var stamp = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var mature = addDays_(new Date(), -CFG.BUFFER_DAYS);
  var startDate = parseIso_('2026-06-01');
  var cap = addDays_(mature, -89);
  if (cap > startDate) startDate = cap;
  var lo = ymd_(startDate), hi = ymd_(mature);

  var dates = [];
  for (var dcur = new Date(startDate); dcur <= mature; dcur = addDays_(dcur, 1)) dates.push(iso_(dcur));
  var di = {}; dates.forEach(function (d, i) { di[d] = i; });
  function zeros() { return dates.map(function () { return 0; }); }

  // все ряды в трёх разрезах: a = все устройства, m = мобайл, d = десктоп (+планшеты)
  function tri() { return { a: zeros(), m: zeros(), d: zeros() }; }
  function put(obj, r, field) { if (obj[r.dvx] && di[r.d] != null) obj[r.dvx][di[r.d]] = r[field]; }

  var SKEYS = ['land','prod','quiz_start','quiz_scan','photo_front','photo_side','gen','wall','reg',
               'scan_ok','teaser','unlock','pay_view','buy_ot','buy_sub','full','plan','err','coh','upg'];
  var series = {}; SKEYS.forEach(function (k) { series[k] = tri(); });
  bqQuery_(lmMetricsSql_(lo, hi)).forEach(function (r) {
    if (series[r.metric]) put(series[r.metric], r, 'u');
  });
  bqQuery_(lmRegSql_(lo, hi)).forEach(function (r) { put(series.reg, r, 'reg_u'); });
  var scanLo = ymd_(addDays_(startDate, -14));
  bqQuery_(lmCohSql_(scanLo, hi, iso_(startDate))).forEach(function (r) {
    put(series.coh, r, 'c'); put(series.upg, r, 'w');
  });
  var quiz = {}, unlocks = {};
  bqQuery_(lmQuizSql_(lo, hi)).forEach(function (r) {
    var p = r.metric.split(':'), tgt = p[0] === 'quiz' ? quiz : unlocks, k = p.slice(1).join(':');
    if (!tgt[k]) tgt[k] = tri();
    put(tgt[k], r, 'u');
  });
  var tr = {};
  bqQuery_(lmTransSql_(lo, hi)).forEach(function (r) {
    if (!tr[r.src]) {
      var m = LM_TRANS_MAP[r.src] || [r.src, '', '?'];
      tr[r.src] = { src: r.src, label: m[0], target: m[1], place: m[2],
        u: tri(), bt_ot: tri(), bt_sub: tri(), ba_ot: tri(), ba_sub: tri() };
    }
    ['u','bt_ot','bt_sub','ba_ot','ba_sub'].forEach(function (f) { put(tr[r.src][f], r, f); });
  });
  var unlockBuys = {};
  bqQuery_(lmLockBuySql_(lo, hi)).forEach(function (r) {
    if (!unlockBuys[r.lbl]) unlockBuys[r.lbl] = tri();
    put(unlockBuys[r.lbl], r, 'bu');
  });
  var src = {}, srcBuy = {};
  bqQuery_(lmSrcSql_(lo, hi)).forEach(function (r) {
    if (!src[r.ch]) { src[r.ch] = tri(); srcBuy[r.ch] = tri(); }
    put(src[r.ch], r, 'u'); put(srcBuy[r.ch], r, 'bu');
  });
  var ttb = [];
  bqQuery_(lmTtbSql_(lo, hi)).forEach(function (r) {
    if (di[r.d] != null) ttb.push([di[r.d], Number(r.diff_min), r.dv]);
  });
  ttb.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });

  var out = { generated_at: stamp, key: 'looksmax', name: 'looksmax', track_from: LM_TRACK_FROM,
    dev_split: true, dates: dates, series: series,
    funnel_steps: [['land','Визит лендинга','teal'],['prod','Открыл продукт','teal'],
      ['quiz_start','Квиз: старт','teal'],['quiz_scan','Квиз: дошёл до скана','teal'],
      ['photo_front','Загрузил фото анфас','teal'],['photo_side','Загрузил фото профиль','teal'],
      ['gen','Нажал генерацию','teal'],['wall','Увидел рега-стену','teal'],
      ['reg','Зарегался (≤24ч)','teal'],['scan_ok','Скан готов','teal'],
      ['teaser','Увидел тизер','teal'],['unlock','Кликнул лок в тизере','amber'],
      ['pay_view','Увидел пейволл','amber'],['buy','Купил (однораз+подписка)','violet'],
      ['full','Открыл полный отчёт','violet'],['plan','Пользуется планом глоу-апа','violet']],
    funnel_hint: 'Дневные уники по каждому шагу, суммированные за период · «% пред» = конверсия с предыдущего шага. ' +
      'Шаги могут превышать 100% (сверено с кодом продукта): ~19% юзеров попадают на скан МИМО экрана квиза — ' +
      'лендинг-хэндофф и возврат после реги автозапускают скан (легитимные пути, не баг); «загрузил фото» включает ' +
      'авто-restore фото после редиректов и повторные загрузки — слегка раздут.',
    quiz_order: ['gender','age','fix','bugs','holdback','mirrors','rate','gap','growth','math','ratio','ascended','scan'],
    quiz: quiz, unlocks: unlocks, unlock_buys: unlockBuys,
    src: src, src_buy: srcBuy, ttb: ttb,
    trans: Object.keys(tr).map(function (k) { return tr[k]; }) };
  var ex = ghGetJson_('dashboard/data/widget_looksmax.json');
  ghPutFile_('dashboard/data/widget_looksmax.json', JSON.stringify(out), 'data: looksmax detail refresh', ex && ex.sha);
  Logger.log('looksmax detail: %s дней, %s переходов', dates.length, out.trans.length);
}

// ---------------------------------------------------------------------------
// ДЕТАЛКА ВИДЖЕТА ai-rate-my-face → dashboard/data/widget_ai-rate-my-face.json
// Воронка: лендинг → продукт → загрузка фото → рега-стена (sign up view) → рега →
// пейволл (get feature view) → last-chance → покупка → генерация (после оплаты).
// Базовый CTE переиспользуем из looksmax (lmBaseCte_ — универсальный: dv/cat/act/lbl/pl/ref).
var RMF_PAGE = "overchat[.]ai/web/ai-rate-my-face([/?#]|$)";
var RMF_LAND = "overchat[.]ai/(?:image|video|text|chat|models)/rate-my-face([/?#]|$)";
var RMF_TRANS_MAP = {
  'promo:looksmax-hero': ['looksmax (hero)', 'looksmax', 'модалка'],
  'promo:looksmax': ['looksmax', 'looksmax', 'модалка'],
  'promo:style-analysis-color': ['style-analysis: color', 'ai-style-analysis', 'модалка'],
  'promo:style-analysis-makeup': ['style-analysis: makeup', 'ai-style-analysis', 'модалка'],
  'promo:style-analysis-hairstyle': ['style-analysis: hairstyle', 'ai-style-analysis', 'модалка'],
  'promo:style-analysis-style': ['style-analysis: style', 'ai-style-analysis', 'модалка'],
  'promo:ai-soulmate': ['soulmate', 'ai-soulmate', 'модалка'],
  'promo:browse-catalog': ['каталог', '', 'модалка']
};
function rmfBuysCte_() {
  return ", rmfbuys AS (SELECT user_pseudo_id, ts, event_name, dv FROM lmbase\n" +
"  WHERE event_name IN ('purchase_onetime','subscription_started') AND REGEXP_CONTAINS(pl, r'" + RMF_PAGE + "'))";
}
function rmfMetricsSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + "\n" +
", m AS (SELECT d, dv, user_pseudo_id, CASE\n" +
"    WHEN event_name='page_view' AND REGEXP_CONTAINS(pl, r'" + RMF_LAND + "') THEN 'land'\n" +
// легаси-виджет лендинга (ai_face_rater upload/generate) выпилен продуктом к 20.07 — из воронки убран
"    WHEN event_name='page_view' AND REGEXP_CONTAINS(pl, r'" + RMF_PAGE + "') THEN 'prod'\n" +
"    WHEN event_name='overchat' AND cat='chat' AND act='pop-up' AND lbl='sign up view' AND REGEXP_CONTAINS(pl, r'" + RMF_PAGE + "') THEN 'wall'\n" +
"    WHEN event_name='overchat' AND cat='chat' AND act='pop-up' AND lbl='get feature view' AND REGEXP_CONTAINS(pl, r'" + RMF_PAGE + "') THEN 'pay_view'\n" +
"    WHEN event_name='overchat' AND cat='chat' AND act='pop-up' AND lbl='last chance view' AND REGEXP_CONTAINS(pl, r'" + RMF_PAGE + "') THEN 'lastchance'\n" +
"    WHEN event_name='purchase_onetime' AND REGEXP_CONTAINS(pl, r'" + RMF_PAGE + "') THEN 'buy_ot'\n" +
"    WHEN event_name='subscription_started' AND REGEXP_CONTAINS(pl, r'" + RMF_PAGE + "') THEN 'buy_sub'\n" +
"    WHEN event_name='overchat' AND cat='chat' AND act='request' AND REGEXP_CONTAINS(pl, r'" + RMF_PAGE + "') THEN 'genreq'\n" +
"  END AS metric FROM lmbase)\n" +
"SELECT metric, IFNULL(dv,'a') AS dvx, d, COUNT(DISTINCT user_pseudo_id) AS u\n" +
"FROM m WHERE metric IS NOT NULL GROUP BY GROUPING SETS ((metric, dv, d), (metric, d))";
}
function rmfRegSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + "\n" +
", wall AS (SELECT user_pseudo_id, d, MIN(ts) AS ts, ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv FROM lmbase\n" +
"  WHERE event_name='overchat' AND cat='chat' AND act='pop-up' AND lbl='sign up view' AND REGEXP_CONTAINS(pl, r'" + RMF_PAGE + "') GROUP BY 1,2)\n" +
", regs AS (SELECT user_pseudo_id, MIN(ts) AS ts FROM lmbase WHERE event_name='overchat' AND cat='login' AND act='registration' GROUP BY 1)\n" +
"SELECT IFNULL(w.dv,'a') AS dvx, w.d,\n" +
"  COUNT(DISTINCT IF(r.ts >= w.ts AND r.ts <= w.ts + 86400*1000000, w.user_pseudo_id, NULL)) AS reg_u\n" +
"FROM wall w LEFT JOIN regs r USING(user_pseudo_id) GROUP BY GROUPING SETS ((w.dv, w.d), (w.d))";
}
function rmfCohSql_(scanLo, hi, cohLo) {
  return "WITH " + excludedCte_(scanLo, hi) + lmBaseCte_(scanLo, hi) + "\n" +
", allbuys AS (SELECT user_pseudo_id, ts, event_name, dv, REGEXP_EXTRACT(pl, r'overchat[.]ai/web/([^/?#]+)') AS pslug\n" +
"  FROM lmbase WHERE event_name IN ('purchase_onetime','subscription_started') AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/'))\n" +
", firstot AS (SELECT user_pseudo_id, ARRAY_AGG(STRUCT(pslug, ts, dv, CAST(DATE(TIMESTAMP_MICROS(ts)) AS STRING) AS d) ORDER BY ts LIMIT 1)[OFFSET(0)] AS f\n" +
"  FROM allbuys WHERE event_name='purchase_onetime' GROUP BY 1)\n" +
", subs AS (SELECT user_pseudo_id, MIN(ts) AS sub_ts FROM allbuys WHERE event_name='subscription_started' GROUP BY 1)\n" +
"SELECT IFNULL(fo.f.dv,'a') AS dvx, fo.f.d AS d, COUNT(DISTINCT fo.user_pseudo_id) AS c,\n" +
"  COUNT(DISTINCT IF(s.sub_ts IS NOT NULL AND s.sub_ts > fo.f.ts, fo.user_pseudo_id, NULL)) AS w\n" +
"FROM firstot fo LEFT JOIN subs s USING(user_pseudo_id)\n" +
"WHERE fo.f.pslug='ai-rate-my-face' AND (s.sub_ts IS NULL OR s.sub_ts > fo.f.ts) AND fo.f.d >= '" + cohLo + "'\n" +
"GROUP BY GROUPING SETS ((fo.f.dv, fo.f.d), (fo.f.d))";
}
function rmfSrcSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + rmfBuysCte_() + "\n" +
", lands AS (SELECT user_pseudo_id, d, MIN(ts) AS ts, ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv, CASE\n" +
"    WHEN REGEXP_CONTAINS(pl, r'[?&](gclid|gbraid|wbraid|fbclid|ttclid)=')\n" +
"      OR REGEXP_CONTAINS(LOWER(IFNULL(REGEXP_EXTRACT(pl, r'[?&]utm_medium=([^&#]+)'),'')), r'cpc|paid|ppc') THEN 'paid'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'chatgpt|perplexity|claude[.]ai|gemini|copilot') THEN 'ai'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'overchat[.]ai') THEN 'internal'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'tiktok|instagram|facebook|youtube|t[.]co/|reddit|pinterest|vk[.]com') THEN 'social'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'google[.]|bing[.]|yandex|duckduckgo|brave|ecosia|yahoo|ya[.]ru|coccoc|search[.]') THEN 'organic'\n" +
"    WHEN ref IS NULL OR ref='' THEN 'direct' ELSE 'other' END AS ch\n" +
"  FROM lmbase WHERE event_name='page_view' AND REGEXP_CONTAINS(pl, r'" + RMF_LAND + "')\n" +
"  GROUP BY user_pseudo_id, d, ch)\n" +
"SELECT l.ch, IFNULL(l.dv,'a') AS dvx, l.d, COUNT(DISTINCT l.user_pseudo_id) AS u,\n" +
"  COUNT(DISTINCT IF(b.user_pseudo_id IS NOT NULL, l.user_pseudo_id, NULL)) AS bu\n" +
"FROM lands l LEFT JOIN rmfbuys b ON b.user_pseudo_id=l.user_pseudo_id AND b.ts>l.ts AND b.ts<=l.ts+86400*1000000\n" +
"GROUP BY GROUPING SETS ((l.ch, l.dv, l.d), (l.ch, l.d))";
}
function rmfTtbSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + rmfBuysCte_() + "\n" +
", firstprod AS (SELECT user_pseudo_id, MIN(ts) AS ts FROM lmbase\n" +
"  WHERE event_name='page_view' AND REGEXP_CONTAINS(pl, r'" + RMF_PAGE + "') GROUP BY 1)\n" +
", firstbuy AS (SELECT user_pseudo_id, MIN(ts) AS ts, ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv FROM rmfbuys GROUP BY 1)\n" +
"SELECT CAST(DATE(TIMESTAMP_MICROS(fb.ts)) AS STRING) AS d, fb.dv, ROUND((fb.ts-fp.ts)/60000000,1) AS diff_min\n" +
"FROM firstbuy fb JOIN firstprod fp USING(user_pseudo_id) WHERE fb.ts >= fp.ts";
}
function rmfTransSql_(lo, hi) {
  var t = [];
  Object.keys(RMF_TRANS_MAP).forEach(function (s) {
    if (RMF_TRANS_MAP[s][1]) t.push("STRUCT('" + s + "' AS src,'" + RMF_TRANS_MAP[s][1] + "' AS tp)");
  });
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + "\n" +
", clicks AS (SELECT user_pseudo_id, ts, d, dv, 'promo:'||SUBSTR(act,5) AS src FROM lmbase\n" +
"  WHERE event_name='overchat' AND cat='rate-my-face-post-onboarding' AND STARTS_WITH(act,'cta-'))\n" +
", tgt AS (SELECT * FROM UNNEST([" + t.join(',') + "]))\n" +
", buys AS (SELECT user_pseudo_id, ts, event_name, REGEXP_EXTRACT(pl, r'overchat[.]ai/web/([^/?#]+)') AS pslug\n" +
"  FROM lmbase WHERE event_name IN ('purchase_onetime','subscription_started') AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/'))\n" +
", fc AS (SELECT src, user_pseudo_id, d, MIN(ts) AS ts, ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv FROM clicks GROUP BY 1,2,3)\n" +
"SELECT fc.src, IFNULL(fc.dv,'a') AS dvx, fc.d, COUNT(DISTINCT fc.user_pseudo_id) AS u,\n" +
"  COUNT(DISTINCT IF(b.event_name='purchase_onetime' AND b.pslug=t.tp, fc.user_pseudo_id, NULL)) AS bt_ot,\n" +
"  COUNT(DISTINCT IF(b.event_name='subscription_started' AND b.pslug=t.tp, fc.user_pseudo_id, NULL)) AS bt_sub,\n" +
"  COUNT(DISTINCT IF(b.event_name='purchase_onetime' AND b.pslug!='ai-rate-my-face', fc.user_pseudo_id, NULL)) AS ba_ot,\n" +
"  COUNT(DISTINCT IF(b.event_name='subscription_started' AND b.pslug!='ai-rate-my-face', fc.user_pseudo_id, NULL)) AS ba_sub\n" +
"FROM fc LEFT JOIN tgt t ON t.src=fc.src\n" +
"LEFT JOIN buys b ON b.user_pseudo_id=fc.user_pseudo_id AND b.ts>fc.ts AND b.ts<=fc.ts+14*86400*1000000\n" +
"GROUP BY GROUPING SETS ((fc.src, fc.dv, fc.d), (fc.src, fc.d))";
}
function buildWidgetRMF_() {
  var stamp = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var mature = addDays_(new Date(), -CFG.BUFFER_DAYS);
  var startDate = parseIso_('2026-06-01');
  var cap = addDays_(mature, -89);
  if (cap > startDate) startDate = cap;
  var lo = ymd_(startDate), hi = ymd_(mature);
  var dates = [];
  for (var dcur = new Date(startDate); dcur <= mature; dcur = addDays_(dcur, 1)) dates.push(iso_(dcur));
  var di = {}; dates.forEach(function (d, i) { di[d] = i; });
  function zeros() { return dates.map(function () { return 0; }); }
  function tri() { return { a: zeros(), m: zeros(), d: zeros() }; }
  function put(obj, r, field) { if (obj[r.dvx] && di[r.d] != null) obj[r.dvx][di[r.d]] = r[field]; }

  var SKEYS = ['land','prod','wall','reg','pay_view','lastchance','buy_ot','buy_sub','genreq','coh','upg'];
  var series = {}; SKEYS.forEach(function (k) { series[k] = tri(); });
  bqQuery_(rmfMetricsSql_(lo, hi)).forEach(function (r) { if (series[r.metric]) put(series[r.metric], r, 'u'); });
  bqQuery_(rmfRegSql_(lo, hi)).forEach(function (r) { put(series.reg, r, 'reg_u'); });
  var scanLo = ymd_(addDays_(startDate, -14));
  bqQuery_(rmfCohSql_(scanLo, hi, iso_(startDate))).forEach(function (r) { put(series.coh, r, 'c'); put(series.upg, r, 'w'); });
  var src = {}, srcBuy = {};
  bqQuery_(rmfSrcSql_(lo, hi)).forEach(function (r) {
    if (!src[r.ch]) { src[r.ch] = tri(); srcBuy[r.ch] = tri(); }
    put(src[r.ch], r, 'u'); put(srcBuy[r.ch], r, 'bu');
  });
  var ttb = [];
  bqQuery_(rmfTtbSql_(lo, hi)).forEach(function (r) { if (di[r.d] != null) ttb.push([di[r.d], Number(r.diff_min), r.dv]); });
  ttb.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
  var tr = {};
  bqQuery_(rmfTransSql_(lo, hi)).forEach(function (r) {
    if (!tr[r.src]) {
      var m = RMF_TRANS_MAP[r.src] || [r.src, '', '?'];
      tr[r.src] = { src: r.src, label: m[0], target: m[1], place: m[2],
        u: tri(), bt_ot: tri(), bt_sub: tri(), ba_ot: tri(), ba_sub: tri() };
    }
    ['u','bt_ot','bt_sub','ba_ot','ba_sub'].forEach(function (f) { put(tr[r.src][f], r, f); });
  });
  var out = { generated_at: stamp, key: 'ai-rate-my-face', name: 'rate-my-face', track_from: '2026-06-01',
    dev_split: true, dates: dates, series: series,
    funnel_steps: [['land','Визит лендинга','teal'],['prod','Открыл продукт','teal'],
      ['wall','Увидел рега-стену','teal'],['reg','Зарегался (≤24ч)','teal'],
      ['pay_view','Увидел пейволл','amber'],['lastchance','Увидел last-chance оффер','amber'],
      ['buy','Купил (однораз+подписка)','violet'],['genreq','Запросил генерацию','violet']],
    funnel_hint: 'Дневные уники по каждому шагу за период · «% пред» = конверсия с предыдущего шага. ' +
      'Загрузка фото и «оценить» на лендинге были ЛЕГАСИ-виджетом (выпилен, к 20.07 обнулился) — убраны из воронки; ' +
      'теперь фото грузят уже в продукте. Рега-стена (sign up view) показывается не только после загрузки и занижена трекингом ~15–20%. ' +
      'Генерация идёт ПОСЛЕ покупки — полный рейтинг разблокируется оплатой.',
    src: src, src_buy: srcBuy, ttb: ttb,
    trans: Object.keys(tr).map(function (k) { return tr[k]; }) };
  var ex = ghGetJson_('dashboard/data/widget_ai-rate-my-face.json');
  ghPutFile_('dashboard/data/widget_ai-rate-my-face.json', JSON.stringify(out), 'data: rate-my-face detail refresh', ex && ex.sha);
  Logger.log('rate-my-face detail: %s дней, %s переходов', dates.length, out.trans.length);
}

// ---------------------------------------------------------------------------
// ДЕТАЛКА ВИДЖЕТА ai-add-person-to-photo → widget.html?w=ai-add-person-to-photo
// Онбординг: виджет-загрузчик на лендинге (ai_add_person_to_photo_*, запущен 09.07) → продукт → рега-стена → пейволл → покупка → генерация.
var AP_PAGE = "overchat[.]ai/web/ai-add-person-to-photo([/?#]|$)";
var AP_LAND = "overchat[.]ai/(?:image|video|text|chat|models)/add-person-to-photo([/?#]|$)";
var AP_TRANS_MAP = {
  'promo:make-video': ['make-video', 'ai-face-swap-video', 'модалка'],
  'promo:image-combiner': ['image-combiner', 'ai-image-combiner', 'модалка'],
  'promo:aspect-ratio-changer': ['aspect-ratio-changer', 'aspect-ratio-changer', 'модалка'],
  'promo:kissing-generator': ['kissing-generator', 'ai-kissing-generator', 'модалка'],
  'promo:browse-catalog': ['каталог', '', 'модалка']
};
function apBuysCte_() {
  return ", apbuys AS (SELECT user_pseudo_id, ts, event_name, dv FROM lmbase\n" +
"  WHERE event_name IN ('purchase_onetime','subscription_started') AND REGEXP_CONTAINS(pl, r'" + AP_PAGE + "'))";
}
function apMetricsSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + "\n" +
", m AS (SELECT d, dv, user_pseudo_id, CASE\n" +
"    WHEN event_name='page_view' AND REGEXP_CONTAINS(pl, r'" + AP_LAND + "') THEN 'land'\n" +
"    WHEN event_name='ai_add_person_to_photo_upload_success' THEN 'fr_upload'\n" +
"    WHEN event_name='ai_add_person_to_photo_click_generate' THEN 'fr_gen'\n" +
"    WHEN event_name='page_view' AND REGEXP_CONTAINS(pl, r'" + AP_PAGE + "') THEN 'prod'\n" +
"    WHEN event_name='overchat' AND cat='chat' AND act='pop-up' AND lbl='sign up view' AND REGEXP_CONTAINS(pl, r'" + AP_PAGE + "') THEN 'wall'\n" +
"    WHEN event_name='overchat' AND cat='chat' AND act='pop-up' AND lbl='get feature view' AND REGEXP_CONTAINS(pl, r'" + AP_PAGE + "') THEN 'pay_view'\n" +
"    WHEN event_name='overchat' AND cat='chat' AND act='pop-up' AND lbl='last chance view' AND REGEXP_CONTAINS(pl, r'" + AP_PAGE + "') THEN 'lastchance'\n" +
"    WHEN event_name='purchase_onetime' AND REGEXP_CONTAINS(pl, r'" + AP_PAGE + "') THEN 'buy_ot'\n" +
"    WHEN event_name='subscription_started' AND REGEXP_CONTAINS(pl, r'" + AP_PAGE + "') THEN 'buy_sub'\n" +
"    WHEN event_name='overchat' AND cat='chat' AND act='request' AND REGEXP_CONTAINS(pl, r'" + AP_PAGE + "') THEN 'genreq'\n" +
"  END AS metric FROM lmbase)\n" +
"SELECT metric, IFNULL(dv,'a') AS dvx, d, COUNT(DISTINCT user_pseudo_id) AS u\n" +
"FROM m WHERE metric IS NOT NULL GROUP BY GROUPING SETS ((metric, dv, d), (metric, d))";
}
function apRegSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + "\n" +
", wall AS (SELECT user_pseudo_id, d, MIN(ts) AS ts, ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv FROM lmbase\n" +
"  WHERE event_name='overchat' AND cat='chat' AND act='pop-up' AND lbl='sign up view' AND REGEXP_CONTAINS(pl, r'" + AP_PAGE + "') GROUP BY 1,2)\n" +
", regs AS (SELECT user_pseudo_id, MIN(ts) AS ts FROM lmbase WHERE event_name='overchat' AND cat='login' AND act='registration' GROUP BY 1)\n" +
"SELECT IFNULL(w.dv,'a') AS dvx, w.d, COUNT(DISTINCT IF(r.ts >= w.ts AND r.ts <= w.ts + 86400*1000000, w.user_pseudo_id, NULL)) AS reg_u\n" +
"FROM wall w LEFT JOIN regs r USING(user_pseudo_id) GROUP BY GROUPING SETS ((w.dv, w.d), (w.d))";
}
function apCohSql_(scanLo, hi, cohLo) {
  return "WITH " + excludedCte_(scanLo, hi) + lmBaseCte_(scanLo, hi) + "\n" +
", allbuys AS (SELECT user_pseudo_id, ts, event_name, dv, REGEXP_EXTRACT(pl, r'overchat[.]ai/web/([^/?#]+)') AS pslug\n" +
"  FROM lmbase WHERE event_name IN ('purchase_onetime','subscription_started') AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/'))\n" +
", firstot AS (SELECT user_pseudo_id, ARRAY_AGG(STRUCT(pslug, ts, dv, CAST(DATE(TIMESTAMP_MICROS(ts)) AS STRING) AS d) ORDER BY ts LIMIT 1)[OFFSET(0)] AS f\n" +
"  FROM allbuys WHERE event_name='purchase_onetime' GROUP BY 1)\n" +
", subs AS (SELECT user_pseudo_id, MIN(ts) AS sub_ts FROM allbuys WHERE event_name='subscription_started' GROUP BY 1)\n" +
"SELECT IFNULL(fo.f.dv,'a') AS dvx, fo.f.d AS d, COUNT(DISTINCT fo.user_pseudo_id) AS c,\n" +
"  COUNT(DISTINCT IF(s.sub_ts IS NOT NULL AND s.sub_ts > fo.f.ts, fo.user_pseudo_id, NULL)) AS w\n" +
"FROM firstot fo LEFT JOIN subs s USING(user_pseudo_id)\n" +
"WHERE fo.f.pslug='ai-add-person-to-photo' AND (s.sub_ts IS NULL OR s.sub_ts > fo.f.ts) AND fo.f.d >= '" + cohLo + "'\n" +
"GROUP BY GROUPING SETS ((fo.f.dv, fo.f.d), (fo.f.d))";
}
function apSrcSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + apBuysCte_() + "\n" +
", lands AS (SELECT user_pseudo_id, d, MIN(ts) AS ts, ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv, CASE\n" +
"    WHEN REGEXP_CONTAINS(pl, r'[?&](gclid|gbraid|wbraid|fbclid|ttclid)=')\n" +
"      OR REGEXP_CONTAINS(LOWER(IFNULL(REGEXP_EXTRACT(pl, r'[?&]utm_medium=([^&#]+)'),'')), r'cpc|paid|ppc') THEN 'paid'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'chatgpt|perplexity|claude[.]ai|gemini|copilot') THEN 'ai'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'overchat[.]ai') THEN 'internal'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'tiktok|instagram|facebook|youtube|t[.]co/|reddit|pinterest|vk[.]com') THEN 'social'\n" +
"    WHEN REGEXP_CONTAINS(IFNULL(ref,''), r'google[.]|bing[.]|yandex|duckduckgo|brave|ecosia|yahoo|ya[.]ru|coccoc|search[.]') THEN 'organic'\n" +
"    WHEN ref IS NULL OR ref='' THEN 'direct' ELSE 'other' END AS ch\n" +
"  FROM lmbase WHERE event_name='page_view' AND REGEXP_CONTAINS(pl, r'" + AP_LAND + "')\n" +
"  GROUP BY user_pseudo_id, d, ch)\n" +
"SELECT l.ch, IFNULL(l.dv,'a') AS dvx, l.d, COUNT(DISTINCT l.user_pseudo_id) AS u,\n" +
"  COUNT(DISTINCT IF(b.user_pseudo_id IS NOT NULL, l.user_pseudo_id, NULL)) AS bu\n" +
"FROM lands l LEFT JOIN apbuys b ON b.user_pseudo_id=l.user_pseudo_id AND b.ts>l.ts AND b.ts<=l.ts+86400*1000000\n" +
"GROUP BY GROUPING SETS ((l.ch, l.dv, l.d), (l.ch, l.d))";
}
function apTtbSql_(lo, hi) {
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + apBuysCte_() + "\n" +
", firstprod AS (SELECT user_pseudo_id, MIN(ts) AS ts FROM lmbase\n" +
"  WHERE event_name='page_view' AND REGEXP_CONTAINS(pl, r'" + AP_PAGE + "') GROUP BY 1)\n" +
", firstbuy AS (SELECT user_pseudo_id, MIN(ts) AS ts, ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv FROM apbuys GROUP BY 1)\n" +
"SELECT CAST(DATE(TIMESTAMP_MICROS(fb.ts)) AS STRING) AS d, fb.dv, ROUND((fb.ts-fp.ts)/60000000,1) AS diff_min\n" +
"FROM firstbuy fb JOIN firstprod fp USING(user_pseudo_id) WHERE fb.ts >= fp.ts";
}
function apTransSql_(lo, hi) {
  var t = [];
  Object.keys(AP_TRANS_MAP).forEach(function (s) {
    if (AP_TRANS_MAP[s][1]) t.push("STRUCT('" + s + "' AS src,'" + AP_TRANS_MAP[s][1] + "' AS tp)");
  });
  return "WITH " + excludedCte_(lo, hi) + lmBaseCte_(lo, hi) + "\n" +
", clicks AS (SELECT user_pseudo_id, ts, d, dv, 'promo:'||SUBSTR(act,5) AS src FROM lmbase\n" +
"  WHERE event_name='overchat' AND cat='add-person-to-photo-post-gen-onboarding' AND STARTS_WITH(act,'cta-'))\n" +
", tgt AS (SELECT * FROM UNNEST([" + t.join(',') + "]))\n" +
", buys AS (SELECT user_pseudo_id, ts, event_name, REGEXP_EXTRACT(pl, r'overchat[.]ai/web/([^/?#]+)') AS pslug\n" +
"  FROM lmbase WHERE event_name IN ('purchase_onetime','subscription_started') AND REGEXP_CONTAINS(pl, r'overchat[.]ai/web/'))\n" +
", fc AS (SELECT src, user_pseudo_id, d, MIN(ts) AS ts, ARRAY_AGG(dv ORDER BY ts LIMIT 1)[OFFSET(0)] AS dv FROM clicks GROUP BY 1,2,3)\n" +
"SELECT fc.src, IFNULL(fc.dv,'a') AS dvx, fc.d, COUNT(DISTINCT fc.user_pseudo_id) AS u,\n" +
"  COUNT(DISTINCT IF(b.event_name='purchase_onetime' AND b.pslug=t.tp, fc.user_pseudo_id, NULL)) AS bt_ot,\n" +
"  COUNT(DISTINCT IF(b.event_name='subscription_started' AND b.pslug=t.tp, fc.user_pseudo_id, NULL)) AS bt_sub,\n" +
"  COUNT(DISTINCT IF(b.event_name='purchase_onetime' AND b.pslug!='ai-add-person-to-photo', fc.user_pseudo_id, NULL)) AS ba_ot,\n" +
"  COUNT(DISTINCT IF(b.event_name='subscription_started' AND b.pslug!='ai-add-person-to-photo', fc.user_pseudo_id, NULL)) AS ba_sub\n" +
"FROM fc LEFT JOIN tgt t ON t.src=fc.src\n" +
"LEFT JOIN buys b ON b.user_pseudo_id=fc.user_pseudo_id AND b.ts>fc.ts AND b.ts<=fc.ts+14*86400*1000000\n" +
"GROUP BY GROUPING SETS ((fc.src, fc.dv, fc.d), (fc.src, fc.d))";
}
function buildWidgetAP_() {
  var stamp = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var mature = addDays_(new Date(), -CFG.BUFFER_DAYS);
  var startDate = parseIso_('2026-06-01');
  var cap = addDays_(mature, -89);
  if (cap > startDate) startDate = cap;
  var lo = ymd_(startDate), hi = ymd_(mature);
  var dates = [];
  for (var dcur = new Date(startDate); dcur <= mature; dcur = addDays_(dcur, 1)) dates.push(iso_(dcur));
  var di = {}; dates.forEach(function (d, i) { di[d] = i; });
  function zeros() { return dates.map(function () { return 0; }); }
  function tri() { return { a: zeros(), m: zeros(), d: zeros() }; }
  function put(obj, r, field) { if (obj[r.dvx] && di[r.d] != null) obj[r.dvx][di[r.d]] = r[field]; }

  var SKEYS = ['land','fr_upload','fr_gen','prod','wall','reg','pay_view','lastchance','buy_ot','buy_sub','genreq','coh','upg'];
  var series = {}; SKEYS.forEach(function (k) { series[k] = tri(); });
  bqQuery_(apMetricsSql_(lo, hi)).forEach(function (r) { if (series[r.metric]) put(series[r.metric], r, 'u'); });
  bqQuery_(apRegSql_(lo, hi)).forEach(function (r) { put(series.reg, r, 'reg_u'); });
  var scanLo = ymd_(addDays_(startDate, -14));
  bqQuery_(apCohSql_(scanLo, hi, iso_(startDate))).forEach(function (r) { put(series.coh, r, 'c'); put(series.upg, r, 'w'); });
  var src = {}, srcBuy = {};
  bqQuery_(apSrcSql_(lo, hi)).forEach(function (r) {
    if (!src[r.ch]) { src[r.ch] = tri(); srcBuy[r.ch] = tri(); }
    put(src[r.ch], r, 'u'); put(srcBuy[r.ch], r, 'bu');
  });
  var ttb = [];
  bqQuery_(apTtbSql_(lo, hi)).forEach(function (r) { if (di[r.d] != null) ttb.push([di[r.d], Number(r.diff_min), r.dv]); });
  ttb.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
  var tr = {};
  bqQuery_(apTransSql_(lo, hi)).forEach(function (r) {
    if (!tr[r.src]) {
      var m = AP_TRANS_MAP[r.src] || [r.src, '', '?'];
      tr[r.src] = { src: r.src, label: m[0], target: m[1], place: m[2],
        u: tri(), bt_ot: tri(), bt_sub: tri(), ba_ot: tri(), ba_sub: tri() };
    }
    ['u','bt_ot','bt_sub','ba_ot','ba_sub'].forEach(function (f) { put(tr[r.src][f], r, f); });
  });
  var out = { generated_at: stamp, key: 'ai-add-person-to-photo', name: 'add-person-to-photo', track_from: '2026-06-01',
    dev_split: true, dates: dates, series: series,
    funnel_steps: [['land','Визит лендинга','teal'],['prod','Открыл продукт','teal'],
      ['pay_view','Увидел пейволл','amber'],['buy','Купил (однораз+подписка)','violet']],
    funnel_hint: 'Воронка ПОКУПКИ: визит → продукт → пейволл → покупка. Пейволл (get feature view) — универсальный гейт перед оплатой, ' +
      'его проходят и залогиненные, и разлогиненные. Регистрация НЕ в этой воронке — это отдельная ветка только для разлогиненных ' +
      '(рега-стену видят не все, залогиненные её минуют), смотри её в KPI «рега после стены». Онбординг-виджет на лендинге ' +
      '(загрузка+генерация, с 09.07) — опциональный путь входа, тоже вне основной воронки. «% пред» = конверсия с предыдущего шага. ' +
      'Покупка → генерация результата разблокируется оплатой.',
    src: src, src_buy: srcBuy, ttb: ttb,
    trans: Object.keys(tr).map(function (k) { return tr[k]; }) };
  var ex = ghGetJson_('dashboard/data/widget_ai-add-person-to-photo.json');
  ghPutFile_('dashboard/data/widget_ai-add-person-to-photo.json', JSON.stringify(out), 'data: add-person-to-photo detail refresh', ex && ex.sha);
  Logger.log('add-person detail: %s дней, %s переходов', dates.length, out.trans.length);
}

// ГЛАВНАЯ: запускать ежедневно — пересчитывает последние RECOMPUTE_DAYS зрелых дней
function runDaily() {
  var mature = addDays_(new Date(), -CFG.BUFFER_DAYS);
  var from = new Date(Math.max(parseIso_(CFG.HISTORY_START).getTime(),
                               addDays_(mature, -(CFG.RECOMPUTE_DAYS - 1)).getTime()));
  if (from > mature) throw new Error('Окно пусто (проверь BUFFER/HISTORY_START)');
  refreshRange_(from, mature, null, 'daily refresh');
  try { buildWidgetsDaily_(); } catch (e) { Logger.log('widgets daily error: ' + e); }
  try { buildWidgetLooksmax_(); } catch (e) { Logger.log('looksmax detail error: ' + e); }
  try { buildWidgetRMF_(); } catch (e) { Logger.log('rate-my-face detail error: ' + e); }
  try { buildWidgetAP_(); } catch (e) { Logger.log('add-person detail error: ' + e); }
}

// БЭКФИЛЛ ИСТОРИИ: гонит кусками по CHUNK_DAYS от свежего к старому, пока не дойдёт до HISTORY_START.
// Запускать руками, возможно НЕСКОЛЬКО РАЗ (лимит 6 мин/запуск) — каждый кусок коммитится,
// повторный запуск продолжает с места остановки. Готово, когда в логе «Бэкфилл завершён».
function backfillHistory() {
  var started = Date.now();
  var mature = addDays_(new Date(), -CFG.BUFFER_DAYS);
  var histStart = parseIso_(CFG.HISTORY_START);
  for (var i = 0; i < 12; i++) {
    if (Date.now() - started > 4.5 * 60 * 1000) { Logger.log('⏳ Время на исходе — запусти backfillHistory ещё раз'); return; }
    var exDaily = ghGetJson_(CFG.PATH_DAILY);
    var rows = (exDaily && exDaily.json.rows) || [];
    var missingEnd = rows.length ? addDays_(parseIso_(rows[0].landing_day), -1) : mature;
    if (missingEnd < histStart) { Logger.log('✅ Бэкфилл завершён: история с %s', rows.length ? rows[0].landing_day : '—'); return; }
    var chunkFrom = new Date(Math.max(histStart.getTime(), addDays_(missingEnd, -(CFG.CHUNK_DAYS - 1)).getTime()));
    var scanTo = new Date(Math.min(mature.getTime(), addDays_(missingEnd, CFG.CHUNK_LOOKAHEAD).getTime()));
    refreshRange_(chunkFrom, missingEnd, scanTo, 'backfill');
  }
  Logger.log('⏳ 12 кусков за прогон — запусти backfillHistory ещё раз, если не увидела «завершён»');
}

// Точечный пересчёт произвольного диапазона (руками), напр. backfillRange('2026-06-21','2026-07-07')
function backfillRange(fromIso, toIso) {
  var to = parseIso_(toIso);
  var mature = addDays_(new Date(), -CFG.BUFFER_DAYS);
  var scanTo = new Date(Math.min(mature.getTime(), addDays_(to, CFG.CHUNK_LOOKAHEAD).getTime()));
  refreshRange_(parseIso_(fromIso), to, scanTo, 'range refresh');
}

// Создать ежедневный триггер (запустить ОДИН раз; повторный запуск пересоздаст)
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runDaily') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runDaily').timeBased().everyDays(1).atHour(9).create(); // 09:00 по TZ проекта
  Logger.log('Триггер создан: runDaily ежедневно ~09:00 (' + Session.getScriptTimeZone() + ')');
}

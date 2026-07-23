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
// ВИДЖЕТЫ ЗА НЕДЕЛЮ → dashboard/data/widgets_weekly.json (страница widgets.html)
// Карта: лендинг → топ-продукт по фактическим переходам за 28 дн. Неделя = 7 зрелых дней.
function widgetsMapCte_(loYmd, hiYmd) {
  return "lmap AS (\n" +
"  WITH ev AS (SELECT user_pseudo_id, event_timestamp AS ts,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') AS pl\n" +
"    FROM `" + CFG.BQ_PROJECT + ".analytics_469242162.events_*`\n" +
"    WHERE _TABLE_SUFFIX BETWEEN '" + loYmd + "' AND '" + hiYmd + "' AND event_name='page_view'\n" +
"      AND user_pseudo_id NOT IN (SELECT user_pseudo_id FROM excluded_users)\n" +
"      AND IFNULL(device.web_info.hostname,'') NOT IN ('stage.overchat.ai','widget.overchat.ai')\n" +
"      AND NOT EXISTS(SELECT 1 FROM UNNEST(event_params) WHERE key='test_user'))\n" +
"  , land AS (SELECT user_pseudo_id, REGEXP_EXTRACT(pl, r'overchat[.]ai/(?:image|video|text|chat|models)/([^/?#]+)') AS lslug, MIN(ts) AS lts FROM ev WHERE REGEXP_CONTAINS(pl, r'overchat[.]ai/(?:image|video|text|chat|models)/') GROUP BY 1,2 HAVING lslug IS NOT NULL)\n" +
"  , prod AS (SELECT user_pseudo_id, REGEXP_EXTRACT(pl, r'overchat[.]ai/web/([^/?#]+)') AS pslug, MIN(ts) AS pts FROM ev WHERE REGEXP_CONTAINS(pl, r'overchat[.]ai/web/') AND NOT REGEXP_CONTAINS(pl, r'/web/c/') GROUP BY 1,2 HAVING pslug IS NOT NULL AND pslug NOT IN ('auth','catalog','settings','subscribe','subscription','app','media','account','billing','pricing','home','login','signup','checkout'))\n" +
"  , pair AS (SELECT l.lslug, p.pslug, COUNT(DISTINCT l.user_pseudo_id) AS u FROM land l JOIN prod p ON l.user_pseudo_id=p.user_pseudo_id AND p.pts>=l.lts GROUP BY 1,2)\n" +
"  , ranked AS (SELECT lslug, pslug, ROW_NUMBER() OVER (PARTITION BY lslug ORDER BY u DESC) AS rn FROM pair)\n" +
"  , vis AS (SELECT lslug, COUNT(DISTINCT user_pseudo_id) AS visits FROM land GROUP BY 1)\n" +
"  SELECT v.lslug, IFNULL(r.pslug, CONCAT('LANDONLY:', v.lslug)) AS wkey, IFNULL(r.pslug,'~none~') AS pslug\n" +
"  FROM vis v LEFT JOIN ranked r ON v.lslug=r.lslug AND r.rn=1 WHERE v.visits > 100\n" +
")";
}

function widgetsWeeklySql_(mapLo, mapHi, wLo, wMid, wHi) { // wLo..wMid-1 = P, wMid..wHi = W
  return "WITH " + excludedCte_(mapLo, mapHi) + ",\n" + widgetsMapCte_(mapLo, mapHi) + "\n" +
", base AS (SELECT user_pseudo_id, event_timestamp AS ts, event_name,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') AS pl\n" +
"  FROM `" + CFG.BQ_PROJECT + ".analytics_469242162.events_*`\n" +
"  WHERE _TABLE_SUFFIX BETWEEN '" + wLo + "' AND '" + wHi + "'\n" +
"    AND event_name IN ('page_view','purchase_onetime','subscription_started')\n" +
"    AND user_pseudo_id NOT IN (SELECT user_pseudo_id FROM excluded_users)\n" +
"    AND IFNULL(device.web_info.hostname,'') NOT IN ('stage.overchat.ai','widget.overchat.ai')\n" +
"    AND NOT EXISTS(SELECT 1 FROM UNNEST(event_params) WHERE key='test_user'))\n" +
", ev AS (SELECT base.*, FORMAT_DATE('%Y%m%d', DATE(TIMESTAMP_MICROS(ts))) AS d8,\n" +
"    COALESCE(REGEXP_EXTRACT(pl, r'overchat[.]ai/(?:image|video|text|chat|models)/([^/?#]+)'),'~') AS lslug,\n" +
"    COALESCE(REGEXP_EXTRACT(pl, r'overchat[.]ai/web/([^/?#]+)'),'~') AS pslug FROM base)\n" +
", tagged AS (SELECT m.wkey, m.pslug AS wprod, e.user_pseudo_id, e.event_name,\n" +
"    IF(e.d8 >= '" + wMid + "','W','P') AS win,\n" +
"    (e.lslug=m.lslug) AS on_land, (e.pslug=m.pslug) AS on_prod\n" +
"  FROM ev e JOIN lmap m ON e.lslug=m.lslug OR e.pslug=m.pslug)\n" +
", pu AS (SELECT wkey, win, user_pseudo_id,\n" +
"    LOGICAL_OR(on_land AND event_name='page_view') AS s1,\n" +
"    LOGICAL_OR(on_prod AND event_name='purchase_onetime') AS has_ot,\n" +
"    LOGICAL_OR(on_prod AND event_name='subscription_started') AS has_sub\n" +
"  FROM tagged GROUP BY 1,2,3)\n" +
"SELECT wkey, win, COUNTIF(s1) AS visits, COUNTIF(has_ot OR has_sub) AS buys,\n" +
"  COUNTIF(has_ot) AS buy_ot, COUNTIF(has_sub) AS buy_sub\n" +
"FROM pu GROUP BY 1,2";
}

function widgetsUpgSql_(mapLo, mapHi, scanLo, scanHi, curLo, curHi, prevLo) {
  return "WITH " + excludedCte_(mapLo, mapHi) + ",\n" + widgetsMapCte_(mapLo, mapHi) + "\n" +
", base AS (SELECT user_pseudo_id, event_timestamp AS ts, event_name,\n" +
"    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') AS pl\n" +
"  FROM `" + CFG.BQ_PROJECT + ".analytics_469242162.events_*`\n" +
"  WHERE _TABLE_SUFFIX BETWEEN '" + scanLo + "' AND '" + scanHi + "'\n" +
"    AND event_name IN ('purchase_onetime','subscription_started')\n" +
"    AND user_pseudo_id NOT IN (SELECT user_pseudo_id FROM excluded_users)\n" +
"    AND IFNULL(device.web_info.hostname,'') NOT IN ('stage.overchat.ai','widget.overchat.ai')\n" +
"    AND NOT EXISTS(SELECT 1 FROM UNNEST(event_params) WHERE key='test_user'))\n" +
", ev AS (SELECT base.*, FORMAT_DATE('%Y%m%d', DATE(TIMESTAMP_MICROS(ts))) AS d8,\n" +
"    COALESCE(REGEXP_EXTRACT(pl, r'overchat[.]ai/web/([^/?#]+)'),'~') AS pslug FROM base)\n" +
", firstot AS (SELECT user_pseudo_id, ARRAY_AGG(STRUCT(pslug, ts, d8) ORDER BY ts LIMIT 1)[OFFSET(0)] AS f\n" +
"  FROM ev WHERE event_name='purchase_onetime' GROUP BY 1)\n" +
", subs AS (SELECT user_pseudo_id, MIN(ts) AS sub_ts FROM ev WHERE event_name='subscription_started' GROUP BY 1)\n" +
", coh AS (SELECT DISTINCT m.wkey, fo.user_pseudo_id, fo.f.d8 AS cd,\n" +
"    (s.sub_ts IS NOT NULL AND s.sub_ts > fo.f.ts AND s.sub_ts <= fo.f.ts + 7*86400*1000000) AS upg\n" +
"  FROM firstot fo JOIN lmap m ON fo.f.pslug = m.pslug\n" +
"  LEFT JOIN subs s USING(user_pseudo_id)\n" +
"  WHERE s.sub_ts IS NULL OR s.sub_ts > fo.f.ts)\n" +
"SELECT wkey, IF(cd >= '" + curLo + "','C','PREV') AS win,\n" +
"  COUNT(DISTINCT user_pseudo_id) AS coh_n, COUNT(DISTINCT IF(upg, user_pseudo_id, NULL)) AS upg_n\n" +
"FROM coh WHERE cd BETWEEN '" + prevLo + "' AND '" + curHi + "' GROUP BY 1,2";
}

function buildWidgetsWeekly_() {
  var stamp = Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var mature = addDays_(new Date(), -CFG.BUFFER_DAYS);
  var wHi = mature, wMid = addDays_(mature, -6), wLo = addDays_(mature, -13);
  var mapLo = addDays_(mature, -27), mapHi = mature;
  var curHi = addDays_(mature, -8), curLo = addDays_(curHi, -27), prevLo = addDays_(curLo, -28);
  var scanLo = prevLo, scanHi = mature;

  var wk = bqQuery_(widgetsWeeklySql_(ymd_(mapLo), ymd_(mapHi), ymd_(wLo), ymd_(wMid), ymd_(wHi)));
  var ug = bqQuery_(widgetsUpgSql_(ymd_(mapLo), ymd_(mapHi), ymd_(scanLo), ymd_(scanHi), ymd_(curLo), ymd_(curHi), ymd_(prevLo)));

  var byW = {};
  wk.forEach(function (r) { (byW[r.wkey] = byW[r.wkey] || {})[r.win] = r; });
  var byU = {};
  ug.forEach(function (r) { (byU[r.wkey] = byU[r.wkey] || {})[r.win] = r; });

  var widgets = Object.keys(byW).map(function (k) {
    var w = byW[k].W || {}, p = byW[k].P || {};
    var uc = (byU[k] || {}).C || {}, up = (byU[k] || {}).PREV || {};
    var name = k.replace('LANDONLY:', '');
    if (name.indexOf('ai-') === 0) name = name.substring(3);
    return { key: k, name: name, product: k.indexOf('LANDONLY:')===0 ? '' : k, landings: [],
      visits: w.visits||0, visitsP: p.visits||0, buys: w.buys||0, buysP: p.buys||0,
      buyOt: w.buy_ot||0, buySub: w.buy_sub||0,
      cohN: uc.coh_n||0, upgN: uc.upg_n||0, cohNP: up.coh_n||0, upgNP: up.upg_n||0 };
  });
  var out = { generated_at: stamp,
    week: { from: iso_(wMid), to: iso_(wHi) }, prev: { from: iso_(wLo), to: iso_(addDays_(wMid,-1)) },
    upg_window: { from: iso_(curLo), to: iso_(curHi), prev_from: iso_(prevLo), prev_to: iso_(addDays_(curLo,-1)) },
    widgets: widgets };
  var ex = ghGetJson_('dashboard/data/widgets_weekly.json');
  ghPutFile_('dashboard/data/widgets_weekly.json', JSON.stringify(out), 'data: widgets weekly refresh', ex && ex.sha);
  Logger.log('widgets weekly: %s виджетов', widgets.length);
}

// ГЛАВНАЯ: запускать ежедневно — пересчитывает последние RECOMPUTE_DAYS зрелых дней
function runDaily() {
  var mature = addDays_(new Date(), -CFG.BUFFER_DAYS);
  var from = new Date(Math.max(parseIso_(CFG.HISTORY_START).getTime(),
                               addDays_(mature, -(CFG.RECOMPUTE_DAYS - 1)).getTime()));
  if (from > mature) throw new Error('Окно пусто (проверь BUFFER/HISTORY_START)');
  refreshRange_(from, mature, null, 'daily refresh');
  try { buildWidgetsWeekly_(); } catch (e) { Logger.log('widgets weekly error: ' + e); }
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

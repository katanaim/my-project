/**
 * Overchat — дневные воронки по виджетам (v3, после ревью Claude 23.07.2026).
 *
 * ИСПРАВЛЕНО в v3 (см. dashboard/EVENTS.md в репо):
 *  🔴 1. Тест-юзеры теперь РЕАЛЬНО исключаются: раньше user_pseudo_id сравнивался со списком
 *        user_id (разные ID-пространства, фильтр был пустышкой). Теперь CTE excl: user_id → pseudo_id.
 *  🔴 2. Стейдж и widget.overchat.ai отрезаны по hostname (регекс 'overchat.ai/' матчил и
 *        'stage.overchat.ai/' как подстроку — стейдж-покупки попадали в таблицу).
 *  🔴 3. + фильтр test_user-параметра (запущен 21.07, на overchat-событиях).
 *  🔴 4. Флуд фейковых purchase-событий 06–08.06.2026 вырезан (страховка для rebuildMonth).
 *  🟠 5. Revenue помечен как справочный: GA `value` = прайс каталога С VAT, не собранные деньги.
 *  🟡 6. ALL-секция чистится от слитых дублей (имена с пробелами: chat_pop-up_* и т.п.)
 *        и heartbeat-события (пустые cat/act/label).
 *  🟡 7. Суффиксы вкладок при коллизии имён детерминированы (~2, ~3), не random.
 *  ➕ 8. Новая вкладка «🌍 Весь продукт (по дням)» — данные из dashboard-репо (единый
 *        источник правды с katanaim.github.io/my-project/dashboard/), без своего пересчёта.
 *
 * ОСОЗНАННО ОСТАВЛЕНО КАК БЫЛО (это выбор методологии, не баг):
 *  - Воронка same-day (все шаги в один день) → конверсии ниже кросс-дневных когорт дашборда.
 *  - Недельные колонки = same-week → с дневными НЕ сравнивать (механически выше).
 *  - Рега кросс-страничная (зарегался где угодно в этот день).
 *  - /web/image-generator/<под-виджет> коллапсирует в один слаг.
 */

const PROJECT  = 'zinc-hour-447409-k5';
const DATASET  = 'analytics_469242162';
const LOCATION = 'EU';
const TZ       = 'Europe/Moscow';
const MIN_VISITS = 100;
const CONFIG_SHEET = '_config';
const WEEK_COLOR = '#fff2cc';
const KEY_BG = '#d9ead3', ALL_BG = '#efefef', BUY_BG = '#fce5cd';
const MIN_EVENT_USERS = 3;

// вкладка всего продукта — данные из репо дашборда (единый источник правды)
const PRODUCT_TAB = '🌍 Весь продукт (по дням)';
const GH_RAW = 'https://raw.githubusercontent.com/katanaim/my-project/master/dashboard/data/';

const SEC_KEY = 'КЛЮЧЕВАЯ ВОРОНКА (вложенная, % от визита лендинга)';
const SEC_ALL = 'ВСЕ СОБЫТИЯ (уники; % от визита лендинга)';
const SEC_BUY = 'ПОКУПКИ И REVENUE';

const KEY_STEPS = [
 '1. Визит лендинга','2. Загрузка фото','3. Клик генерации','4. Вход в продукт',
 '5. Попап регистрации','6. Регистрация','7. Пейволл показан','8. Покупка (с лендинга)'
];
const BUY_ROWS = ['Покупок всего (все web)','— разовая','— подписка','· weekly','· monthly','· yearly','— купили и то, и то','Revenue ~$ (СПРАВОЧНО: прайс+VAT, деньги в Stripe)'];

const EXCLUDED = [
 '3f660b7b-eed6-4a7f-bc42-1deb6d661f92','95121354-86d2-467e-ae4e-594c206ce712','b6e2b67a-6dae-4983-af05-dfcd9e308b70',
 '84dd3ea3-32f3-4f3a-a988-0e8b5cc5785a','33459694-b9bb-4be5-b861-fc8d781ae43e','d4ad1190-b206-4fba-a346-0b82e8424ee3',
 'fc91c9fc-f6f1-4389-b89f-6e69c3416a8d','8eefe93b-1b56-488c-8d0a-11d052590946','7b552b11-79eb-4216-8dcc-8fc81807cb29',
 '109b2b7e-a7d0-4752-8eac-7d4c1d714c43','448cc757-97c3-41c8-87fd-59b9c9599879','3d7c65b5-7ff5-4aa2-a5cd-d022004e3bb9',
 'b9d2d800-cd4c-4dfe-8d7c-e8fbee0572a4','8d6a56c8-c51f-49d5-afb5-56ede7101338','006dbf43-2f8c-4f1e-875e-62e41f34a38f',
 '5b6e25cb-9fab-4f63-a5d6-d3341a4d2b69','95f19c8d-892d-4942-8f90-076ebbf87650','1e44618c-72a5-4888-87fd-d3617e632505',
 'c1dd0080-ffe5-47a5-8dcd-3131da76d712','52de69a5-8fa4-429a-a129-208fd871a576','576c352e-c7f6-4806-b450-eeb47be072b6',
 'da2b3e9d-daf9-4793-91e5-9134cfcc9520','3409159a-1bce-4088-b13b-08ac7ee26769','4545cb85-8d15-4abe-8f21-5e0f46eda953',
 '08d96883-f1fe-487d-a5ad-2f245204661a','10c3c0fb-3548-4761-b0bc-ad182d4188dc','ff33f9e8-df8d-4694-b557-57e44047a056',
 '1cc23996-24b0-46c6-9014-0981fb601b08','9bcbdad1-d586-4224-bf1a-de1a29d29ada','9b9e5219-ef22-4674-ae44-74e58d46c138',
 '2af75b8e-9960-4b47-b905-6da11979f735','a783cc24-51cd-46fe-930e-5d89bd24b312','17c27526-4b43-453b-915c-88f11cd0daa7',
 '9892bba8-be74-411f-9521-7df1d16c8081','6a30fe24-2574-484f-ac9f-cc85a6223991','d12a6fba-5bcd-447b-9122-23c3fc11e3b5',
 'b832d021-bdfd-492c-b96d-c731edb39ff6','adebd97a-5368-468d-8241-4434eba0b93e','76ed8c83-2759-477b-ae83-6f8c9510ffa4',
 '473d51a1-5420-4a4c-8305-60d34a136634','b9b0a844-8add-4943-9756-b548f6ed47db','fd44501a-05ed-4742-9b37-347e60f806d7',
 'eec6bcc7-a013-4db9-a58c-fc7fa868623a','1cf155a0-0389-4d41-aab3-ffc86fe65a34','e080acaf-41fc-4442-81ae-e658309d3d61',
 '1ff3966e-dd84-41f1-bf00-a4eda726b794','1d8ebef3-f1d0-4137-be8d-4df5ee37a9d3','60cc53fa-d2eb-4fe8-a008-743822d1bf87',
 '1d57c7dd-6801-4d1d-8db5-4976dba8d1d3','e1da9b04-87e4-4c1e-9cf8-02fb16a152a7'
];

// ---------- утилиты ----------
function ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function ymd(d){ return Utilities.formatDate(d, TZ, 'yyyyMMdd'); }
function dlabel(d){ return Utilities.formatDate(d, TZ, 'dd.MM'); }
function today(){ const n=new Date(); const s=Utilities.formatDate(n, TZ, 'yyyy/MM/dd'); return new Date(s); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function sqlList(a){ return a.map(x=>"'"+x+"'").join(','); }

function bq(sql){
  let r = BigQuery.Jobs.query({ query: sql, useLegacySql: false, location: LOCATION, timeoutMs: 60000 }, PROJECT);
  const jobId = r.jobReference.jobId;
  while (!r.jobComplete) { Utilities.sleep(2000); r = BigQuery.Jobs.getQueryResults(PROJECT, jobId, {location: LOCATION}); }
  let rows = r.rows || [];
  while (r.pageToken) { r = BigQuery.Jobs.getQueryResults(PROJECT, jobId, {location: LOCATION, pageToken: r.pageToken}); rows = rows.concat(r.rows||[]); }
  return rows.map(row => row.f.map(c => c.v));
}

// ФИКС v3 (№1): тест-юзеры — user_id → pseudo_id через CTE (раньше фильтр был пустышкой!)
function exclCte(suffixPred){
  return "excl AS (SELECT DISTINCT user_pseudo_id FROM `"+PROJECT+"."+DATASET+".events_*` "
    + "WHERE "+suffixPred+" AND user_id IN ("+sqlList(EXCLUDED)+"))";
}
// ФИКС v3 (№2,3): базовые фильтры чистоты — вставлять в WHERE каждого base
const CLEAN_FILTERS = " AND IFNULL(device.web_info.hostname,'') NOT IN ('stage.overchat.ai','widget.overchat.ai')"
  + " AND NOT EXISTS(SELECT 1 FROM UNNEST(event_params) WHERE key='test_user')";
// ФИКС v3 (№4): флуд фейковых purchase-событий
const FLOOD_GUARD = "DATE(TIMESTAMP_MICROS(event_timestamp)) NOT IN ('2026-06-06','2026-06-07','2026-06-08')";

// ---------- карта виджетов ----------
function mappingSql(){
  return "WITH "+exclCte("_TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY)) AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY))")+", "
   + "ev AS (SELECT user_pseudo_id, event_timestamp AS ts, (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') AS pl "
   + "FROM `"+PROJECT+"."+DATASET+".events_*` WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY)) AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY)) AND event_name='page_view' "
   + "AND user_pseudo_id NOT IN (SELECT user_pseudo_id FROM excl)"+CLEAN_FILTERS+"), "
   + "land AS (SELECT user_pseudo_id, REGEXP_EXTRACT(pl, r'overchat[.]ai/(?:image|video|text|chat|models)/([^/?#]+)') AS lslug, MIN(ts) AS lts FROM ev WHERE REGEXP_CONTAINS(pl, r'overchat[.]ai/(?:image|video|text|chat|models)/') GROUP BY 1,2 HAVING lslug IS NOT NULL), "
   + "prod AS (SELECT user_pseudo_id, REGEXP_EXTRACT(pl, r'overchat[.]ai/web/([^/?#]+)') AS pslug, MIN(ts) AS pts FROM ev WHERE REGEXP_CONTAINS(pl, r'overchat[.]ai/web/') AND NOT REGEXP_CONTAINS(pl, r'/web/c/') GROUP BY 1,2 HAVING pslug IS NOT NULL AND pslug NOT IN ('auth','catalog','settings','subscribe','subscription','app','media','account','billing','pricing','home','login','signup','checkout')), "
   + "pair AS (SELECT l.lslug, p.pslug, COUNT(DISTINCT l.user_pseudo_id) AS u FROM land l JOIN prod p ON l.user_pseudo_id=p.user_pseudo_id AND p.pts>=l.lts GROUP BY 1,2), "
   + "ranked AS (SELECT lslug, pslug, ROW_NUMBER() OVER (PARTITION BY lslug ORDER BY u DESC) AS rn FROM pair), "
   + "visits AS (SELECT lslug, COUNT(DISTINCT user_pseudo_id) AS visits FROM land GROUP BY 1) "
   + "SELECT v.lslug, IFNULL(r.pslug,'') AS pslug, v.visits FROM visits v LEFT JOIN ranked r ON v.lslug=r.lslug AND r.rn=1 WHERE v.visits > "+MIN_VISITS+" ORDER BY v.visits DESC";
}

function refreshConfig(){
  const rows = bq(mappingSql());
  const byKey = {};
  rows.forEach(r => {
    const lslug=r[0], pslug=r[1]||'', v=Number(r[2]);
    const key = pslug || ('LANDONLY:'+lslug);
    if(!byKey[key]) byKey[key] = { product: pslug, landings: [], visits: 0 };
    byKey[key].landings.push(lslug);
    byKey[key].visits += v;
  });
  const used = {};
  const widgets = Object.keys(byKey).map(k => {
    const w = byKey[k];
    let base = (w.product || w.landings[0]).replace(/^ai-/,'').substring(0,24);
    let name = base, n = 2;
    while (used[name]) name = base+'~'+(n++);   // ФИКС v3 (№7): детерминированный суффикс, не random
    used[name] = 1;
    return { tab: name, product: w.product, landings: w.landings, visits: w.visits };
  }).sort((a,b)=>b.visits-a.visits);

  let sh = ss().getSheetByName(CONFIG_SHEET) || ss().insertSheet(CONFIG_SHEET);
  sh.clear();
  const out = [['tab','product','landings','visits']].concat(widgets.map(w=>[w.tab, w.product, w.landings.join(','), w.visits]));
  sh.getRange(1,1,out.length,4).setValues(out);
  sh.hideSheet();
  return widgets;
}
function readConfig(){
  const sh = ss().getSheetByName(CONFIG_SHEET);
  if (!sh || sh.getLastRow()<2) return [];
  return sh.getRange(2,1,sh.getLastRow()-1,4).getValues()
    .filter(r=>r[0])
    .map(r => ({ tab:String(r[0]), product:String(r[1]||''), landings:String(r[2]).split(',').filter(Boolean), visits:Number(r[3]) }));
}
function ensureConfig(){ const c = readConfig(); return c.length ? c : refreshConfig(); }

// ---------- SQL метрик ----------
function metricsSql(widgets, suffixPred, dtExpr){
  const mapRows = [];
  widgets.forEach(w => {
    const p = w.product || '~none~';
    w.landings.forEach(l => mapRows.push("STRUCT('"+w.tab.replace(/'/g,'')+"' AS wkey,'"+l+"' AS lslug,'"+p+"' AS pslug)"));
  });
  const REG_POPUP = "('sign up view','sign-up-shown','get stars view')";
  const PAYWALL   = "('get feature view','credits paywall view','paywall-shown')";
  return ""
  + "WITH "+exclCte(suffixPred)+", "
  + "map AS (SELECT * FROM UNNEST(["+mapRows.join(',')+"])), "
  + "base AS (SELECT "+dtExpr+" AS dt, user_pseudo_id, event_name, "
  +   "(SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') AS pl, "
  +   "(SELECT value.string_value FROM UNNEST(event_params) WHERE key='eventCategory') AS cat, "
  +   "(SELECT value.string_value FROM UNNEST(event_params) WHERE key='eventAction') AS act, "
  +   "(SELECT value.string_value FROM UNNEST(event_params) WHERE key='eventLabel') AS lbl, "
  +   "(SELECT value.double_value FROM UNNEST(event_params) WHERE key='value') AS price "
  +   "FROM `"+PROJECT+"."+DATASET+".events_*` WHERE "+suffixPred+" AND event_name!='user_id_pushed' "
  +   "AND user_pseudo_id NOT IN (SELECT user_pseudo_id FROM excl)"+CLEAN_FILTERS
  +   " AND NOT (event_name LIKE 'purchase%' AND NOT "+FLOOD_GUARD+")), "  // ФИКС v3 (№4)
  + "ev AS (SELECT base.*, COALESCE(REGEXP_EXTRACT(pl, r'overchat[.]ai/(?:image|video|text|chat|models)/([^/?#]+)'),'~') AS lslug, "
  +   "COALESCE(REGEXP_EXTRACT(pl, r'overchat[.]ai/web/([^/?#]+)'),'~') AS pslug FROM base), "
  + "reg AS (SELECT DISTINCT dt, user_pseudo_id FROM base WHERE event_name='overchat' AND cat='login' AND act='registration'), "
  + "tagged AS (SELECT m.wkey, e.dt, e.user_pseudo_id, e.event_name, e.cat, e.act, e.lbl, e.price, "
  +   "(e.lslug=m.lslug) AS on_land, (e.pslug=m.pslug) AS on_prod FROM ev e JOIN map m ON e.lslug=m.lslug OR e.pslug=m.pslug), "
  + "pu AS (SELECT t.wkey, t.dt, t.user_pseudo_id, "
  +   "LOGICAL_OR(t.on_land AND t.event_name='page_view') AS s1, "
  +   "LOGICAL_OR(t.on_land AND REGEXP_CONTAINS(t.event_name, r'upload_success$')) AS s2, "
  +   "LOGICAL_OR(t.on_land AND REGEXP_CONTAINS(t.event_name, r'(click_generate|click_combine|click_swap|click_find|widget_submit|click_analyze)$')) AS s3, "
  +   "LOGICAL_OR(t.on_prod AND t.event_name='page_view') AS s4, "
  +   "LOGICAL_OR(t.on_prod AND t.event_name='overchat' AND t.act='pop-up' AND t.lbl IN "+REG_POPUP+") AS s5, "
  +   "LOGICAL_OR(r.user_pseudo_id IS NOT NULL) AS s6, "
  +   "LOGICAL_OR(t.on_prod AND t.event_name='overchat' AND t.act='pop-up' AND t.lbl IN "+PAYWALL+") AS s7, "
  +   "LOGICAL_OR(t.on_prod AND t.event_name IN ('purchase_onetime','subscription_started')) AS s8, "
  +   "LOGICAL_OR(t.on_prod AND t.event_name='purchase_onetime') AS has_ot, "
  +   "LOGICAL_OR(t.on_prod AND t.event_name='subscription_started') AS has_sub, "
  +   "LOGICAL_OR(t.on_prod AND t.event_name='subscription_started' AND t.price<9) AS sub_wk, "
  +   "LOGICAL_OR(t.on_prod AND t.event_name='subscription_started' AND t.price>=9 AND t.price<25) AS sub_mo, "
  +   "LOGICAL_OR(t.on_prod AND t.event_name='subscription_started' AND t.price>=25) AS sub_yr, "
  +   "MAX(IF(t.on_prod AND t.event_name='subscription_started', t.price, 0)) AS sub_price "
  +   "FROM tagged t LEFT JOIN reg r ON t.dt=r.dt AND t.user_pseudo_id=r.user_pseudo_id GROUP BY t.wkey, t.dt, t.user_pseudo_id), "
  + "keyagg AS (SELECT wkey, dt, "
  +   "COUNTIF(s1) AS k1, "
  +   "COUNTIF(s1 AND (s2 OR s3 OR s4 OR s5 OR s6 OR s7 OR s8)) AS k2, "
  +   "COUNTIF(s1 AND (s3 OR s4 OR s5 OR s6 OR s7 OR s8)) AS k3, "
  +   "COUNTIF(s1 AND (s4 OR s5 OR s6 OR s7 OR s8)) AS k4, "
  +   "COUNTIF(s1 AND (s5 OR s6 OR s7 OR s8)) AS k5, "
  +   "COUNTIF(s1 AND (s6 OR s7 OR s8)) AS k6, "
  +   "COUNTIF(s1 AND (s7 OR s8)) AS k7, "
  +   "COUNTIF(s1 AND s8) AS k8 FROM pu GROUP BY wkey, dt), "
  + "keyf AS (SELECT wkey, dt, 'key' AS block, u.ord, u.lab, u.users FROM keyagg, UNNEST(["
  +   "STRUCT(1 AS ord,'"+KEY_STEPS[0]+"' AS lab,k1 AS users),STRUCT(2,'"+KEY_STEPS[1]+"',k2),STRUCT(3,'"+KEY_STEPS[2]+"',k3),STRUCT(4,'"+KEY_STEPS[3]+"',k4),"
  +   "STRUCT(5,'"+KEY_STEPS[4]+"',k5),STRUCT(6,'"+KEY_STEPS[5]+"',k6),STRUCT(7,'"+KEY_STEPS[6]+"',k7),STRUCT(8,'"+KEY_STEPS[7]+"',k8)]) AS u), "
  + "s1u AS (SELECT wkey, dt, user_pseudo_id FROM pu WHERE s1), "
  + "gated AS (SELECT t.* FROM tagged t JOIN s1u USING (wkey, dt, user_pseudo_id)), "
  // ФИКС v3 (№6): режем слитые дубли (имя с пробелом = склейка cat_act_label) и heartbeat (- / - / -)
  + "alle AS (SELECT wkey, dt, 'all' AS block, 100 AS ord, lab, users FROM ("
  +   "SELECT wkey, dt, CASE WHEN on_land THEN CONCAT('L: ', event_name) "
  +     "WHEN on_prod AND event_name='overchat' AND (cat IS NOT NULL OR act IS NOT NULL OR lbl IS NOT NULL) "
  +       "THEN CONCAT('P: ', IFNULL(cat,'-'),' / ',IFNULL(act,'-'),' / ',IFNULL(lbl,'-')) "
  +     "WHEN on_prod AND event_name!='overchat' AND event_name NOT LIKE '% %' AND event_name!='__' "
  +       "THEN CONCAT('P: ', event_name) ELSE NULL END AS lab, "
  +   "COUNT(DISTINCT user_pseudo_id) AS users FROM gated GROUP BY wkey, dt, lab) WHERE lab IS NOT NULL AND users >= "+MIN_EVENT_USERS+"), "
  + "buyagg AS (SELECT wkey, dt, "
  +   "COUNTIF(has_ot OR has_sub) AS b_tot, "
  +   "COUNTIF(has_ot) AS b_ot, "
  +   "COUNTIF(has_sub) AS b_sub, "
  +   "COUNTIF(sub_wk) AS b_wk, "
  +   "COUNTIF(sub_mo) AS b_mo, "
  +   "COUNTIF(sub_yr) AS b_yr, "
  +   "COUNTIF(has_ot AND has_sub) AS b_both, "
  +   "ROUND(SUM(sub_price)) AS sub_rev "
  +   "FROM pu GROUP BY wkey, dt), "
  + "buy AS (SELECT wkey, dt, 'buy' AS block, u.ord, u.lab, u.users FROM buyagg, UNNEST(["
  +   "STRUCT(201 AS ord,'"+BUY_ROWS[0]+"' AS lab,b_tot AS users),STRUCT(202,'"+BUY_ROWS[1]+"',b_ot),STRUCT(203,'"+BUY_ROWS[2]+"',b_sub),"
  +   "STRUCT(204,'"+BUY_ROWS[3]+"',b_wk),STRUCT(205,'"+BUY_ROWS[4]+"',b_mo),STRUCT(206,'"+BUY_ROWS[5]+"',b_yr),"
  +   "STRUCT(207,'"+BUY_ROWS[6]+"',b_both),"
  +   "STRUCT(208,'"+BUY_ROWS[7]+"', CAST(ROUND(b_ot*2.99 + sub_rev) AS INT64))]) AS u) "
  + "SELECT wkey, dt, block, ord, lab, users FROM keyf "
  + "UNION ALL SELECT wkey, dt, block, ord, lab, users FROM alle "
  + "UNION ALL SELECT wkey, dt, block, ord, lab, users FROM buy";
}

function suffixEq(d){ return "_TABLE_SUFFIX='"+ymd(d)+"'"; }
function suffixBetween(a,b){ return "_TABLE_SUFFIX BETWEEN '"+ymd(a)+"' AND '"+ymd(b)+"'"; }

function fetchMetrics(widgets, suffixPred, dtExpr){
  const rows = bq(metricsSql(widgets, suffixPred, dtExpr));
  const out = {};
  rows.forEach(r => {
    const w=r[0], dt=r[1];
    if(!out[w]) out[w]={};
    if(!out[w][dt]) out[w][dt]={};
    out[w][dt][r[4]] = { block:r[2], ord:Number(r[3]), users:Number(r[5]) };
  });
  return out;
}

// ---------- ЗАПИСЬ: read-once → build grid → write-once ----------
function writeTab(w, entries){
  let sh = ss().getSheetByName(w.tab);
  const fresh = !sh;
  if (fresh) sh = ss().insertSheet(w.tab);

  let grid = [];
  if (!fresh && sh.getLastRow()>0) grid = sh.getDataRange().getValues();

  let header = grid.length ? grid[0].map(String) : [];
  if (!header.length) header = ['Шаг / Событие', (w.landings.join(', ')+'  →  '+(w.product?('web/'+w.product):'(только лендинг)'))];
  const oldRows = {};
  for (let i=1;i<grid.length;i++){ const lab=String(grid[i][0]); if (lab) oldRows[lab]=grid[i]; }

  const newAll = {};
  entries.forEach(e => Object.keys(e.m).forEach(lab => { if (e.m[lab].block==='all') newAll[lab]=1; }));
  Object.keys(oldRows).forEach(lab => { if (lab.indexOf('L: ')===0 || lab.indexOf('P: ')===0) newAll[lab]=1; });
  const allLabels = Object.keys(newAll).sort();
  const rowLabels = [SEC_KEY].concat(KEY_STEPS).concat([SEC_ALL]).concat(allLabels).concat([SEC_BUY]).concat(BUY_ROWS);

  const colOfDate = {};
  for (let c=1;c<header.length;c++){ const h=header[c]; if (h && h!=='%') colOfDate[h]=c; }
  entries.forEach(e => { if (!(e.label in colOfDate)) { colOfDate[e.label]=header.length; header.push(e.label,'%'); } });
  const nCols = header.length, nRows = rowLabels.length+1;

  const out = []; out.push(header.slice());
  const rowIdx = {};
  rowLabels.forEach((lab,i) => {
    const r = new Array(nCols).fill('');
    r[0]=lab;
    const old = oldRows[lab];
    if (old) for (let c=1;c<Math.min(old.length,nCols);c++) r[c]=old[c];
    rowIdx[lab]=i+1;
    out.push(r);
  });
  entries.forEach(e => {
    const c = colOfDate[e.label];
    for (let i=1;i<nRows;i++){ out[i][c]=''; out[i][c+1]=''; }
    const base = (e.m[KEY_STEPS[0]] && e.m[KEY_STEPS[0]].users) || 0;
    Object.keys(e.m).forEach(lab => {
      const d = e.m[lab]; const ri = rowIdx[lab];
      if (ri===undefined) return;
      out[ri][c] = d.users;
      if (!(d.block==='buy' && d.ord===208) && base>0) out[ri][c+1] = d.users/base;
    });
  });

  if (!fresh) sh.clear();
  const fmts = [];
  for (let i=0;i<nRows;i++){
    const row = new Array(nCols).fill('0');
    if (i===0) row.fill('@');
    else for (let c=1;c<nCols;c++) if (header[c]==='%') row[c]='0.0%';
    fmts.push(row);
  }
  fmts.forEach(r => { r[0]='@'; });
  sh.getRange(1,1,nRows,nCols).setNumberFormats(fmts);
  sh.getRange(1,1,nRows,nCols).setValues(out);

  const sheetRow = lab => rowIdx[lab]+1;
  sh.getRange(1,1,nRows,nCols).setBackground(null).setFontWeight('normal');
  sh.getRange(1,1,1,nCols).setFontWeight('bold');
  sh.getRange(sheetRow(SEC_KEY),1,1,nCols).setBackground(KEY_BG).setFontWeight('bold');
  sh.getRange(sheetRow(SEC_ALL),1,1,nCols).setBackground(ALL_BG).setFontWeight('bold');
  sh.getRange(sheetRow(SEC_BUY),1,1,nCols).setBackground(BUY_BG).setFontWeight('bold');
  for (let c=1;c<nCols;c++) if (String(header[c]).indexOf('нед ')===0) sh.getRange(1,c+1,nRows,2).setBackground(WEEK_COLOR);
  sh.setFrozenRows(1); sh.setFrozenColumns(1); if (fresh) sh.setColumnWidth(1,250);
}

// ---------- 🌍 ВЕСЬ ПРОДУКТ ПО ДНЯМ (из репо дашборда — единый источник правды) ----------
// Никакого своего пересчёта: числа = katanaim.github.io/my-project/dashboard/ (кросс-дневные
// когорты с лукбэком, составной признак покупки, вычищенные аномалии). Свежие дни сверху.
function updateProductTab(){
  const fetchJson = p => JSON.parse(UrlFetchApp.fetch(GH_RAW+p, {muteHttpExceptions:false}).getContentText());
  const daily = fetchJson('funnel_daily.json');
  const purch = fetchJson('purchases_events.json');
  let ann = {}; try { ann = fetchJson('annotations.json'); } catch(e){}

  // апгрейды по дням (день = дню подписки) + когорты первой одноразки (для конверсии ≤7д)
  const upgByDay = {}, coh = {};   // coh[день первой одноразки] = [всего, апгрейднулось за 7д]
  (purch.users||[]).forEach(u => {
    const o=u.o||[], s=u.s||[];
    if (!o.length) return;
    const o0=o[0];
    if (!s.length || s[0]>o0){       // первая покупка юзера — именно одноразка → он в когорте
      const d = new Date(o0*1000).toISOString().slice(0,10);
      (coh[d]=coh[d]||[0,0])[0]++;
      if (s.some(x => x>o0 && x<=o0+7*86400)) coh[d][1]++;
    }
    const sUp = s.filter(x => x>o0)[0];
    if (sUp){ const d = new Date(sUp*1000).toISOString().slice(0,10); upgByDay[d]=(upgByDay[d]||0)+1; }
  });

  const head = ['Дата','День','Лендинг','Продукт','Рега','Пейволл','Покупка','Однораз','Подписка',
                'Апгрейды/день','Ког. однораз','Онетайм→Подп ≤7д',
                'Л→Прод','Прод→Рега','Рега→Пейв','Пейв→Куп','Л→Куп'];
  const DN = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  const lastIso = daily.rows[daily.rows.length-1].landing_day;
  const matureCut = Date.parse(lastIso+'T00:00:00Z')/1000 - 8*86400;  // когорты моложе 8 дней не дозрели
  const rows = daily.rows.slice().reverse().map(r => {
    const land=+r.landing, prod=+r.product, reg=+r.registration, pay=+r.paywall, buy=+r.purchase;
    const dt = new Date(r.landing_day+'T00:00:00Z');
    const pctv = (a,b)=> b>0 ? a/b : '';
    const c = coh[r.landing_day];
    const mature = Date.parse(r.landing_day+'T00:00:00Z')/1000 <= matureCut;
    const upg7 = (c && c[0]>=5 && mature) ? c[1]/c[0] : '';   // мелкие когорты и незрелые дни — пусто
    return [r.landing_day, DN[dt.getUTCDay()], land, prod, reg, pay, buy,
      r.purchase_onetime==null?'':+r.purchase_onetime, r.purchase_sub==null?'':+r.purchase_sub,
      upgByDay[r.landing_day]||0, c?c[0]:0, upg7,
      pctv(prod,land), pctv(reg,prod), pctv(pay,reg), pctv(buy,pay), pctv(buy,land)];
  });

  let sh = ss().getSheetByName(PRODUCT_TAB) || ss().insertSheet(PRODUCT_TAB, 1);
  sh.clear();
  const out = [head].concat(rows);
  const nR = out.length, nC = head.length;
  const fmts = [];
  for (let i=0;i<nR;i++){
    const row = new Array(nC).fill('0');
    if (i===0) row.fill('@');
    else { row[0]='@'; row[1]='@'; row[11]='0.0%';
           for (let c=12;c<nC;c++) row[c] = (c===15||c===16) ? '0.00%' : '0.0%'; }
    fmts.push(row);
  }
  sh.getRange(1,1,nR,nC).setNumberFormats(fmts);
  sh.getRange(1,1,nR,nC).setValues(out);
  sh.getRange(1,1,1,nC).setFontWeight('bold').setBackground('#1F4E78').setFontColor('#FFFFFF');
  (ann.bands||[]).forEach(b => {
    out.forEach((r,i) => { if (i>0 && r[0]>=b.from && r[0]<=b.to) sh.getRange(i+1,1,1,nC).setBackground('#fff2cc'); });
  });
  const genNote = 'Источник: dashboard-репо (katanaim.github.io/my-project/dashboard/), кросс-дневные когорты с лукбэком.\n'
    + 'Обновлено: '+(daily.generated_at||'')+'\n'
    + 'Апгрейды/день = юзеров, оформивших ПЕРВУЮ подписку после одноразки (день подписки).\n'
    + 'Онетайм→Подп ≤7д = когорта по дню ПЕРВОЙ одноразки: доля с подпиской за 7 дней; пусто = когорта не дозрела (моложе 8 дн) или <5 юзеров.\n'
    + 'ВАЖНО: конверсии тут ВЫШЕ, чем во вкладках виджетов — там same-day воронка, тут юзеру даётся дозреть.\n'
    + ((ann.banner && ann.banner.html) ? 'Аномалии: '+ann.banner.html.replace(/<[^>]+>/g,'') : '');
  sh.getRange(1,1).setNote(genNote);
  sh.setFrozenRows(1); sh.setFrozenColumns(2);
  sh.setColumnWidth(1,90); sh.setColumnWidth(2,40);
}

// ---------- Telegram-дайджест дыр в воронках ----------
const TG_TOP = 10;
const TG_MIN_VISITS = 50;
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtn(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' '); }

function tgSend(text){
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('TG_TOKEN'), chat = p.getProperty('TG_CHAT');
  if (!token || !chat){ Logger.log('TG не настроен (нет TG_TOKEN/TG_CHAT в Script Properties)'); return; }
  const r = UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage', {
    method:'post', contentType:'application/json', muteHttpExceptions:true,
    payload: JSON.stringify({ chat_id: chat, text: text, parse_mode:'HTML', disable_web_page_preview:true })
  });
  Logger.log('TG '+r.getResponseCode()+': '+r.getContentText().slice(0,200));
}
function tgGetChatId(){
  const token = PropertiesService.getScriptProperties().getProperty('TG_TOKEN');
  if (!token){ Logger.log('сначала добавь TG_TOKEN в Script Properties'); return; }
  Logger.log(UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/getUpdates', {muteHttpExceptions:true}).getContentText());
}
function median(a){ if(!a.length) return 0; const s=a.slice().sort((x,y)=>x-y); const m=Math.floor(s.length/2); return s.length%2? s[m] : (s[m-1]+s[m])/2; }

const STEP_PROBLEM = [
  'после лендинга не грузят фото',
  'загрузили фото, но не жмут «Создать»',
  'жмут «Создать», но не доходят до приложения',
  'в продукте не видят попап регистрации',
  'видят попап, но не регистрируются',
  'зарегались, но не доходят до пейволла',
  'видят пейволл, но не покупают'
];
const STEP_TO = ['загрузка фото','клик «Создать»','вход в приложение','попап регистрации','регистрация','пейволл','покупка'];

function buildDigest(widgets, daily, dt, dateLabel, lag){
  const N=KEY_STEPS.length;
  const rows=[]; let visits=0, buys=0, rev=0;
  widgets.forEach(w => {
    const m=(daily[w.tab]&&daily[w.tab][dt])||{};
    const k=KEY_STEPS.map(s => (m[s]&&m[s].users)||0);
    visits += k[0];
    buys += (m[BUY_ROWS[0]]&&m[BUY_ROWS[0]].users)||0;
    rev  += (m[BUY_ROWS[7]]&&m[BUY_ROWS[7]].users)||0;
    if (k[0] >= TG_MIN_VISITS) rows.push({ w:w.tab, k, upRate:(k[0]>0? k[1]/k[0] : 0) });
  });
  const norm=[];
  for (let i=0;i<N-1;i++){
    const rr=[];
    rows.forEach(r=>{ if(r.k[i]<=0) return; if(i===0 && r.upRate<0.05) return; rr.push(r.k[i+1]/r.k[i]); });
    norm[i]=median(rr);
  }
  const leaks=[], suspects=[];
  rows.forEach(r => {
    for (let i=0;i<N-1;i++){
      if (i===0 && r.upRate<0.05) continue;
      const prev=r.k[i]; if (prev<=0) continue;
      const ret=r.k[i+1]/prev, short=norm[i]-ret, recover=short*prev;
      if (short<=0) continue;
      if (ret<0.02 && norm[i]>=0.4){ suspects.push({ w:r.w, to:STEP_TO[i], norm:norm[i] }); continue; }
      if (short<0.05 || recover<25) continue;
      leaks.push({ w:r.w, i, recover, ret, norm:norm[i] });
    }
  });
  leaks.sort((a,b)=>b.recover-a.recover);
  let t=(lag||'')+'<b>📊 Дырки в виджетах — '+esc(dateLabel)+'</b>\n';
  t+='По сайту за день: '+fmtn(visits)+' визитов · '+fmtn(buys)+' покупок · ~$'+fmtn(rev)+' (прайс, не collected)\n\n';
  t+='<b>🔧 Чинить в первую очередь</b> (сверху — важнее)\n';
  t+='<i>«вернёшь N» = столько юзеров пройдут дальше, если подтянуть шаг до нормы соседних виджетов</i>\n\n';
  const top=leaks.slice(0,TG_TOP);
  if (!top.length) t+='крупных дыр нет 👌\n';
  top.forEach((l,idx)=>{
    t+=(idx+1)+'. <b>'+esc(l.w)+'</b> — '+STEP_PROBLEM[l.i]+'\n';
    t+='   '+Math.round(l.ret*100)+'% вместо '+Math.round(l.norm*100)+'% → вернёшь ~'+fmtn(l.recover)+' юзеров/день\n';
  });
  if (suspects.length){
    t+='\n<b>⚠️ Похоже, сломан трекинг</b> (0% там, где обычно много — чинить события, не UX):\n';
    suspects.slice(0,6).forEach(s=>{ t+='• <b>'+esc(s.w)+'</b> — «'+s.to+'» почти не пишется (0% против ~'+Math.round(s.norm*100)+'%)\n'; });
  }
  if (buys===0) t+='\n⚠️ Покупок 0 — проверь трекинг оплат.';
  return t;
}

function convBoardCore(widgets, mL, kL, mP, kP, title, sub){
  const g=(o,k)=>(o[k]&&o[k].users)||0;
  const arr=[];
  widgets.forEach(w => {
    const m=(mL[w.tab]&&mL[w.tab][kL])||{}, mp=(mP[w.tab]&&mP[w.tab][kP])||{};
    const vis=g(m,KEY_STEPS[0]), buy=g(m,BUY_ROWS[0]), ot=g(m,BUY_ROWS[1]), sb=g(m,BUY_ROWS[2]);
    const visP=g(mp,KEY_STEPS[0]), buyP=g(mp,BUY_ROWS[0]);
    if (vis>0) arr.push({ w:w.tab, vis, buy, ot, sub:sb, visP, buyP, conv:buy/vis, convP: visP>0? buyP/visP : null });
  });
  arr.sort((a,b)=>b.vis-a.vis);
  const top=arr.slice(0,20);
  top.sort((a,b)=>b.conv-a.conv);
  const dlt=(cur,prev)=>{ if(prev==null) return ' 🆕'; const d=(cur-prev)*100; if(d>=0.005) return ' ▲+'+d.toFixed(2)+'пп'; if(d<=-0.005) return ' ▼'+d.toFixed(2)+'пп'; return ' ≈'; };
  let t='<b>'+title+'</b>\n<i>'+sub+'</i>\n\n';
  top.forEach(r=>{ t+='<b>'+(r.conv*100).toFixed(2)+'%</b>'+dlt(r.conv,r.convP)+' — '+esc(r.w)+' ('+fmtn(r.vis)+'→'+fmtn(r.buy)+': '+fmtn(r.ot)+'р/'+fmtn(r.sub)+'п)\n'; });
  let tv=0,tb=0,tot=0,tsub=0,tvP=0,tbP=0;
  top.forEach(r=>{ tv+=r.vis; tb+=r.buy; tot+=r.ot; tsub+=r.sub; tvP+=r.visP; tbP+=r.buyP; });
  const conv=tv>0? tb/tv : 0, convP=tvP>0? tbP/tvP : null;
  t+='\n<b>Итого топ-20:</b> '+fmtn(tv)+' → '+fmtn(tb)+' = <b>'+(conv*100).toFixed(2)+'%</b>'+dlt(conv,convP);
  t+='\n<b>По типу:</b> '+fmtn(tot)+' разовых / '+fmtn(tsub)+' подписок';
  return t;
}
function buildConvBoard(widgets, daily, dt, dtPrev, dateLabel, prevLabel){
  return convBoardCore(widgets, daily, dt, daily, dtPrev,
    '💰 Конверсия визит → покупка — '+esc(dateLabel)+' (vs '+esc(prevLabel)+')',
    'топ-20 по трафику · ▲▼ = сдвиг конверсии ко вчера · Xр/Yп = разовые/подписки');
}
function buildWeekBoard(widgets, wLast, wPrev, labLast, labPrev){
  return convBoardCore(widgets, wLast, 'W', wPrev, 'W',
    '📆 Конверсия за 7 ДНЕЙ — '+esc(labLast)+' (vs '+esc(labPrev)+')',
    'топ-20 по трафику · ▲▼ = сдвиг конверсии к прошлым 7 дням · Xр/Yп = разовые/подписки');
}
function lastDataDay(t){
  const r=bq("SELECT MAX(_TABLE_SUFFIX) FROM `"+PROJECT+"."+DATASET+".events_*` WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 12 DAY)) AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))");
  const s=(r[0] && r[0][0]) ? r[0][0] : ymd(addDays(t,-2));
  return new Date(s.slice(0,4)+'/'+s.slice(4,6)+'/'+s.slice(6,8));
}
function weekBounds(t){
  const end=lastDataDay(t);
  return { monL:addDays(end,-6), sunL:end, sunP:addDays(end,-7), monP:addDays(end,-13) };
}
function sendWeekDigest(){
  const t=today(), widgets=ensureConfig(), b=weekBounds(t);
  const wLast=fetchMetrics(widgets, suffixBetween(b.monL,b.sunL), "'W'");
  const wPrev=fetchMetrics(widgets, suffixBetween(b.monP,b.sunP), "'W'");
  tgSend(buildWeekBoard(widgets, wLast, wPrev, dlabel(b.monL)+'–'+dlabel(b.sunL), dlabel(b.monP)+'–'+dlabel(b.sunP)));
}
function sendTestDigest(){
  const t=today(), widgets=ensureConfig();
  const daily=fetchMetrics(widgets, suffixBetween(addDays(t,-4), addDays(t,-1)), '_TABLE_SUFFIX');
  const yd=pickDigestDay(daily, widgets, t), ydp=addDays(yd,-1);
  tgSend(buildDigest(widgets, daily, ymd(yd), dlabel(yd), lagNote(yd,t)));
  tgSend(buildConvBoard(widgets, daily, ymd(yd), ymd(ydp), dlabel(yd), dlabel(ydp)));
}
function dayHasData(daily, widgets, dt){
  let v=0; widgets.forEach(w=>{ const m=(daily[w.tab]&&daily[w.tab][dt])||{}; v+=(m[KEY_STEPS[0]]&&m[KEY_STEPS[0]].users)||0; });
  return v>0;
}
function pickDigestDay(daily, widgets, t){
  for (let k=1;k<=4;k++){ const d=addDays(t,-k); if (dayHasData(daily, widgets, ymd(d))) return d; }
  return addDays(t,-1);
}
function lagNote(yd, t){
  return ymd(yd)!==ymd(addDays(t,-1)) ? '⏳ данные за '+dlabel(addDays(t,-1))+' в GA4 ещё не выгрузились — показываю за '+dlabel(yd)+'\n\n' : '';
}

// ---------- точки входа ----------
function updateDashboard(){
  const t = today();
  const widgets = (t.getDay()===1) ? refreshConfig() : ensureConfig();
  const d1=addDays(t,-4), d2=addDays(t,-1);
  const daily = fetchMetrics(widgets, suffixBetween(d1,d2), '_TABLE_SUFFIX');
  let weekly=null, weekLabel='';
  if (t.getDay()===1){
    const mon=addDays(t,-7), sun=addDays(t,-1);
    weekly = fetchMetrics(widgets, suffixBetween(mon,sun), "'W'");
    weekLabel = 'нед '+dlabel(mon);
  }
  widgets.forEach(w => {
    const entries=[];
    for (let k=3;k>=1;k--){
      const d=addDays(t,-k); const dt=ymd(d);
      entries.push({label:dlabel(d), isWeek:false, m:(daily[w.tab]&&daily[w.tab][dt])||{}});
    }
    if (weekly) entries.push({label:weekLabel, isWeek:true, m:(weekly[w.tab]&&weekly[w.tab]['W'])||{}});
    writeTab(w, entries);
  });
  try { updateProductTab(); } catch(e){ Logger.log('product tab error: '+e); }   // v3: вкладка всего продукта
  SpreadsheetApp.flush();
  try { const yd=pickDigestDay(daily, widgets, t), ydp=addDays(yd,-1); tgSend(buildDigest(widgets, daily, ymd(yd), dlabel(yd), lagNote(yd,t))); tgSend(buildConvBoard(widgets, daily, ymd(yd), ymd(ydp), dlabel(yd), dlabel(ydp))); } catch(e){ Logger.log('TG error: '+e); }
  if (t.getDay()===1) { try { sendWeekDigest(); } catch(e){ Logger.log('TG week error: '+e); } }
}

function backfill(){
  const N = 14;
  const t = today();
  const widgets = refreshConfig();
  const start=addDays(t,-N), end=addDays(t,-1);
  const daily = fetchMetrics(widgets, suffixBetween(start,end), '_TABLE_SUFFIX');
  const weeks=[];
  let sun=addDays(t,-1); while (sun.getDay()!==0) sun=addDays(sun,-1);
  for (let i=0;i<2;i++){
    const s=addDays(sun,-7*i), m=addDays(s,-6);
    if (m>=start) weeks.push({mon:m, sun:s, m:fetchMetrics(widgets, suffixBetween(m,s), "'W'")});
  }
  widgets.forEach(w => {
    const entries=[];
    for (let k=N;k>=1;k--){
      const d=addDays(t,-k); const dt=ymd(d);
      entries.push({label:dlabel(d), isWeek:false, m:(daily[w.tab]&&daily[w.tab][dt])||{}});
    }
    weeks.forEach(wk => entries.push({label:'нед '+dlabel(wk.mon), isWeek:true, m:(wk.m[w.tab]&&wk.m[w.tab]['W'])||{}}));
    writeTab(w, entries);
  });
  SpreadsheetApp.flush();
}

// ПОЛНАЯ ПЕРЕЗАПИСЬ всех вкладок начисто: 30 дней + завершённые недели.
// ⚠️ ЗАПУСТИ ОДИН РАЗ после установки v3 — в старых колонках сидят тест-юзеры и стейдж!
function rebuildMonth(){
  const t = today();
  const START_AGO = 31, END_AGO = 2;
  const oldCfg = readConfig();
  const widgets = refreshConfig();
  const start = addDays(t,-START_AGO), end = addDays(t,-END_AGO);
  const daily = fetchMetrics(widgets, suffixBetween(start,end), '_TABLE_SUFFIX');
  const weeks = [];
  let sun = end; while (sun.getDay()!==0) sun = addDays(sun,-1);
  for (let i=0; i<5; i++){ const s=addDays(sun,-7*i), m=addDays(s,-6); if (m>=start) weeks.push({mon:m, m:fetchMetrics(widgets, suffixBetween(m,s), "'W'")}); }
  weeks.reverse();
  const kill = {}; oldCfg.concat(widgets).forEach(w => kill[w.tab] = 1);
  Object.keys(kill).forEach(name => { const sh = ss().getSheetByName(name); if (sh) ss().deleteSheet(sh); });
  widgets.forEach(w => {
    const entries = [];
    for (let k=START_AGO; k>=END_AGO; k--){ const d=addDays(t,-k); entries.push({label:dlabel(d), isWeek:false, m:(daily[w.tab]&&daily[w.tab][ymd(d)])||{}}); }
    weeks.forEach(wk => entries.push({label:'нед '+dlabel(wk.mon), isWeek:true, m:(wk.m[w.tab]&&wk.m[w.tab]['W'])||{}}));
    writeTab(w, entries);
  });
  try { updateProductTab(); } catch(e){ Logger.log('product tab error: '+e); }
  SpreadsheetApp.flush();
}

function testSmall(){
  const widgets = ensureConfig().slice(0,3);
  const t=today(); const d=addDays(t,-2); const dt=ymd(d);
  const daily = fetchMetrics(widgets, suffixEq(d), '_TABLE_SUFFIX');
  widgets.forEach(w => writeTab(w, [{label:dlabel(d), isWeek:false, m:(daily[w.tab]&&daily[w.tab][dt])||{}}]));
  SpreadsheetApp.flush();
}

function installTrigger(){
  ScriptApp.getProjectTriggers().forEach(tr => { if (tr.getHandlerFunction()==='updateDashboard') ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('updateDashboard').timeBased().everyDays(1).atHour(15).nearMinute(30).inTimezone(TZ).create();
}

// ---------- Журнал гипотез ----------
const JOURNAL_SHEET = '📓 Журнал гипотез';
function setupHypothesisJournal(){
  let sh = ss().getSheetByName(JOURNAL_SHEET);
  if (sh){ ss().setActiveSheet(sh); ss().moveActiveSheet(1); return; }
  sh = ss().insertSheet(JOURNAL_SHEET, 0);
  const head = ['№','Что меняем','Область','Метрика','Ожидаемый эффект','Дата в прод','Оценить после (+3 дня)','Факт (что реально стало)','Вердикт'];
  const seed = [
    [1,'rate-my-face → формат looksmax: онбординг, кастомный пейволл, тизер результата, другой формат результата','виджет rate-my-face','конверсия визит → оплата (rate-my-face)','+1 п.п.','','','','⏳ ждём'],
    [2,'Оплата через Google Pay','весь продукт','конверсия пейволл → оплата','+0.2 п.п.','','','','⏳ ждём'],
    [3,'Last chance offer: 58% скидка на 2-м закрытии пейволла','весь продукт','подписок в неделю','+30%','','','','⏳ ждём'],
    [4,'Неограниченная покупка одноразок','весь продукт','одноразовых оплат','+30%','','','','⏳ ждём'],
    [5,'looksmax: убрать главную оценку из тизера + доработать флоу оценки и качество результата','виджет looksmax','конверсия визит → оплата (looksmax)','+0.4 п.п.','','','','⏳ ждём']
  ];
  const out = [head].concat(seed);
  sh.getRange(1,1,out.length,head.length).setValues(out);
  for (let r=2;r<=out.length;r++) sh.getRange(r,7).setFormula('=IF(F'+r+'="","",F'+r+'+3)');
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(['⏳ ждём','✅ подтвердилось','🟡 частично','❌ не подтвердилось'], true).build();
  sh.getRange(2,9,seed.length,1).setDataValidation(rule);
  sh.getRange(1,1,1,head.length).setFontWeight('bold').setBackground('#1F4E78').setFontColor('#FFFFFF');
  sh.getRange(2,6,seed.length,2).setNumberFormat('dd.MM.yyyy');
  [38,340,150,220,120,100,135,300,150].forEach((wd,i)=>sh.setColumnWidth(i+1,wd));
  sh.getRange(1,1,out.length,head.length).setWrap(true).setVerticalAlignment('top');
  sh.getRange(1,6).setNote('впиши дату выкатки — «оценить после» посчитается сама (+3 дня)');
  sh.getRange(1,8).setNote('заполнить через 3 дня после прода: что реально стало с метрикой');
  sh.setFrozenRows(1); sh.setFrozenColumns(1);
  ss().setActiveSheet(sh); ss().moveActiveSheet(1);
}

function onOpen(){
  SpreadsheetApp.getUi().createMenu('Обновление')
    .addItem('📓 Создать журнал гипотез','setupHypothesisJournal')
    .addItem('🌍 Обновить вкладку всего продукта','updateProductTab')
    .addItem('Обновить сейчас (последние 3 дня)','updateDashboard')
    .addItem('Бэкфилл 14 дней','backfill')
    .addItem('⟳ Перезаписать месяц начисто (30 дн)','rebuildMonth')
    .addItem('Тест Telegram-дайджеста','sendTestDigest')
    .addItem('Тест недельного борда (ТГ)','sendWeekDigest')
    .addToUi();
}

/**
 * BQProxy.gs — самодостаточный SQL-прокси для BigQuery (read-only), чтобы Claude
 * мог сам гонять SELECT-запросы. Один файл, ничего кроме него не нужно.
 *
 * ── УСТАНОВКА (5 минут) ─────────────────────────────────────────────
 * 1. script.google.com → New project. Вставить весь этот файл (заменить содержимое).
 * 2. Слева «Services» (＋) → добавить «BigQuery API».
 * 3. Вписать свой проект в CFG.BQ_PROJECT ниже — это GCP-проект, на который
 *    БИЛЛИТСЯ запрос (у него включён BigQuery API + billing, и у твоего аккаунта
 *    есть доступ к нужному датасету). Узнать: BigQuery-консоль → Project ID.
 * 4. Project Settings (шестерёнка) → Script Properties → добавить свойство
 *    QUERY_TOKEN = длинная случайная строка (30+ символов, сгенерь в пароль-менеджере).
 * 5. Один раз запустить функцию ping() (кнопка ▶) — Google попросит доступ к BigQuery,
 *    разрешить. Это авторизует скрипт.
 * 6. Deploy → New deployment → тип «Web app»:
 *        Execute as: Me
 *        Who has access: Anyone
 *    → Deploy → скопировать URL вида https://script.google.com/macros/s/…/exec
 * 7. В новом чате прислать Claude: этот URL, свой QUERY_TOKEN и путь к таблице
 *    (`project.dataset.table`, для GA4 обычно `…​.analytics_XXXXXXXXX.events_*`).
 *
 * ── БЕЗОПАСНОСТЬ ────────────────────────────────────────────────────
 *  - без верного token запрос отклоняется; токен — это пароль к твоим данным;
 *  - принимается ТОЛЬКО одиночный SELECT/WITH (никаких INSERT/UPDATE/DDL/;);
 *  - ответ обрезается до 10 000 строк; потолок скана — CFG.MAX_GB_PER_QUERY ГБ/запрос;
 *  - отозвать доступ: Deploy → Manage deployments → удалить, ИЛИ сменить QUERY_TOKEN.
 */

var CFG = {
  BQ_PROJECT: 'ВПИШИ_СЮДА_project_id',   // GCP-проект для биллинга запросов
  MAX_GB_PER_QUERY: 200                   // жёсткий потолок скана на 1 запрос (ГБ)
};

function doPost(e) {
  var token = PropertiesService.getScriptProperties().getProperty('QUERY_TOKEN');
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ error: 'bad json' }); }
  if (!token || body.token !== token) return json_({ error: 'unauthorized' });

  var sql = String(body.sql || '');
  sql = sql.split('\n').filter(function (l) { return l.replace(/^\s+/, '').indexOf('--') !== 0; }).join('\n')
           .trim().replace(/;\s*$/, '');
  if (!/^(WITH|SELECT)\b/i.test(sql)) return json_({ error: 'only SELECT/WITH allowed' });
  if (sql.indexOf(';') !== -1)        return json_({ error: 'single statement only' });

  try {
    var t0 = Date.now();
    var rows = bqQuery_(sql);
    return json_({ rows: rows.slice(0, 10000), row_count: rows.length,
                   truncated: rows.length > 10000, elapsed_ms: Date.now() - t0 });
  } catch (err) { return json_({ error: String(err) }); }
}

function doGet() { return json_({ pong: true }); }          // проверка живости в браузере
function ping()  { return bqQuery_('SELECT 1 AS ok'); }     // запустить руками 1 раз для авторизации

function bqQuery_(sql) {
  var cap = String((CFG.MAX_GB_PER_QUERY || 200) * 1073741824);
  var resp = BigQuery.Jobs.query(
    { query: sql, useLegacySql: false, timeoutMs: 300000, maximumBytesBilled: cap },
    CFG.BQ_PROJECT);
  if (!resp.jobComplete) throw new Error('BQ job не завершился за timeout');
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
  while (token) {
    var page = BigQuery.Jobs.getQueryResults(CFG.BQ_PROJECT, resp.jobReference.jobId, { pageToken: token });
    collect(page.rows);
    token = page.pageToken;
  }
  return all;
}

function bqCell_(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(function (x) { return bqCell_(x.v); });
  if (typeof v === 'object' && 'v' in v) return bqCell_(v.v);
  return (typeof v === 'string' && /^-?\d+$/.test(v)) ? parseInt(v, 10) : v;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

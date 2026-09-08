#!/usr/bin/env python3
"""Build the KCR-at-Solo-Nats tracker page from data.json + sched.json (see parse.py)."""
import json, re, unicodedata, datetime

d = json.load(open('data.json'))
sch = json.load(open('sched.json'))
classes, kcr, sched = d['classes'], d['kcr'], sch['sched']

GROUP_DAYS = {'TEWW': ('Tue', 'Wed', 'Tue East / Wed West'), 'TWWE': ('Tue', 'Wed', 'Tue West / Wed East'),
              'TEFW': ('Thu', 'Fri', 'Thu East / Fri West'), 'TWFE': ('Thu', 'Fri', 'Thu West / Fri East')}
GROUP_ORDER = ['TEWW', 'TWWE', 'TEFW', 'TWFE']

def norm(n):
    n = unicodedata.normalize('NFKD', n).encode('ascii', 'ignore').decode().lower()
    return ' '.join(re.sub(r'[^a-z ]', ' ', n).split())

def num(s):
    return float(s) if re.match(r'^\d+\.\d{3}$', s or '') else None

def parse_run(r):
    m = re.match(r'^(\d+\.\d{3})(?:\((\d+)\))?$', r['t'])
    if m:
        return dict(t=float(m.group(1)), cones=int(m.group(2) or 0), best=r['best'])
    return dict(label=r['t'], best=False)

def ordinal(p):
    p = int(re.sub(r'\D', '', p))
    suf = 'th' if 10 <= p % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(p % 10, 'th')
    return f'{p}{suf}'

kcr_by_name = {}
for r in kcr:
    kcr_by_name.setdefault(norm(r['name']), []).append(r)

def _t(s):
    try: return datetime.datetime.strptime(s, '%I:%M:%S %p')
    except Exception: return datetime.datetime.min
asof_dt = max((_t(c['asof']) for c in classes.values() if any(num(e['total']) for e in c['entries'])), default=datetime.datetime.min)
asof = asof_dt.strftime('%-I:%M %p').replace('AM', 'am').replace('PM', 'pm') if asof_dt != datetime.datetime.min else ''
asof = ('Tue Sep 8 ' + asof) if asof else 'unknown'

def class_meta(k):
    c = classes[k]
    s = sched.get(k, {})
    grp = s.get('group', '')
    trophies = sum(1 for e in c['entries'] if e['trophy'] == 'T')
    ran = any(num(e['total']) for e in c['entries'])
    totals = {e['pos']: num(e['total']) for e in c['entries']}
    return dict(cls=k, ncars=c['ncars'], group=grp, groupLabel=GROUP_DAYS.get(grp, ('', '', ''))[2],
                day1=GROUP_DAYS.get(grp, ('', '', ''))[0], day2=GROUP_DAYS.get(grp, ('', '', ''))[1],
                heat=s.get('heat'), trophies=trophies, ran=ran,
                cutoff=totals.get(trophies), bubble=totals.get(trophies + 1), leader=totals.get(1))

def build_entry(e, meta, flag=None):
    total = num(e['total'])
    c1 = [parse_run(r) for r in e['c1']]
    c2 = [parse_run(r) for r in e['c2']]
    ran = total is not None or bool(c1)
    trophy = e['trophy'] == 'T' and ran
    margin = None
    if total is not None:
        if trophy and meta['bubble'] is not None:
            margin = round(meta['bubble'] - total, 3)   # positive = inside by
        elif not trophy and meta['cutoff'] is not None:
            margin = round(total - meta['cutoff'], 3)   # positive = outside by
    gap = num(e['gap'].strip('()')) if e['gap'] else None
    season = [dict(cls=r['cls'], clsname=r['clsname'], pos=r['pos'], posText=ordinal(r['pos']),
                   total=r['total'], drops=r['drops'], nevents=r['nevents']) for r in kcr_by_name.get(norm(e['name']), [])]
    season.sort(key=lambda r: -r['drops'])
    return dict(cls=e['cls'], pos=e['pos'], car=e['car'], name=e['name'], vehicle=e['vehicle'].strip(),
                city=e['city'], region=e['region'], tire=e['tire'], ran=ran, total=total,
                trophy=trophy, margin=margin, gap=gap, c1=c1, c2=c2,
                toLeader=(round(total - meta['leader'], 3) if total is not None and meta['leader'] is not None else None),
                season=season, flag=flag)

metas = {k: class_meta(k) for k in classes}
def order_key(k):
    m = metas[k]
    return (GROUP_ORDER.index(m['group']) if m['group'] in GROUP_ORDER else 9, m['heat'] or 9, k)

kc_entries = []
other_region = []
all_nats = [(k, e) for k, c in classes.items() for e in c['entries']]
for k, e in all_nats:
    if e['region'].lower().startswith('kansas city'):
        kc_entries.append(build_entry(e, metas[k]))
    elif norm(e['name']) in kcr_by_name:
        other_region.append(build_entry(e, metas[k], flag='other-region'))

kc_entries.sort(key=lambda x: (order_key(x['cls']), x['pos']))
other_region.sort(key=lambda x: (order_key(x['cls']), x['pos']))
used = sorted({x['cls'] for x in kc_entries + other_region}, key=order_key)

payload = dict(
    asof=asof,
    generated=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
    classes={k: metas[k] for k in used},
    order=used,
    entries=kc_entries,
    otherRegion=other_region,
    kcrDate='Oct 13, 2025',
)

ran_n = sum(1 for x in kc_entries if x['ran'])
trophy_n = sum(1 for x in kc_entries if x['trophy'])
print(f"entries {len(kc_entries)} ran {ran_n} trophy {trophy_n} other-region {len(other_region)} classes {len(used)} asof {asof!r}")

DATA = json.dumps(payload, separators=(',', ':')).replace('</', '<\\/')

html = r'''<title>KCR at Solo Nats</title>
<meta charset="utf-8">
<style>
:root{
  --bg:#161412; --bg2:#1e1b18; --line:#3a342c; --ink:#ffffff; --muted:#9a9083;
  --accent:#F5C200; --accent-text:#F5C200; --accent-ink:#000000; --zone:rgba(245,194,0,.14);
  --grit-text:#E48378; --box-bg:#ffffff; --box-ink:#000000;
  --font:"Helvetica Neue",Helvetica,Arial,sans-serif;
  --mono:"SF Mono",Menlo,Consolas,monospace;
  color-scheme:dark;
}
@media (prefers-color-scheme: light){
  :root:not([data-theme="dark"]){
    --bg:#ffffff; --bg2:#f4f2ee; --line:#e5e5e5; --ink:#1a1a1a; --muted:#6b6355;
    --accent:#F5C200; --accent-text:#9F7E00; --accent-ink:#000000; --zone:rgba(245,194,0,.22);
    --grit-text:#891F14; --box-bg:#000000; --box-ink:#ffffff; color-scheme:light;
  }
}
:root[data-theme="light"]{
  --bg:#ffffff; --bg2:#f4f2ee; --line:#e5e5e5; --ink:#1a1a1a; --muted:#6b6355;
  --accent:#F5C200; --accent-text:#9F7E00; --accent-ink:#000000; --zone:rgba(245,194,0,.22);
  --grit-text:#891F14; --box-bg:#000000; --box-ink:#ffffff; color-scheme:light;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);font-size:1rem;line-height:1.45;-webkit-font-smoothing:antialiased}
a{color:inherit}
.sheet{max-width:920px;margin:0 auto;padding:2.5rem 2rem 5rem}
@media (max-width:640px){.sheet{padding:1.5rem 1rem 4rem}}

.eyebrow{font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 .9rem}
h1{font-size:clamp(2.25rem,7vw,3.625rem);font-weight:700;text-transform:uppercase;letter-spacing:.01em;line-height:1.04;margin:0;text-wrap:balance}
h1 .hi{color:var(--accent-text)}
.lede{color:var(--muted);max-width:60ch;margin:1.1rem 0 0}
.lede b{color:var(--ink);font-weight:700}
.meta{display:flex;flex-wrap:wrap;gap:.4rem 1.6rem;margin:1.4rem 0 0;font-family:var(--mono);font-size:.75rem;letter-spacing:.02em;color:var(--muted);text-transform:uppercase}
.meta a{color:var(--muted);text-decoration-thickness:1px;text-underline-offset:3px}

.stats{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);margin:2.2rem 0 0}
.stat{padding:1rem 1.1rem;border-right:1px solid var(--line)}
.stat:last-child{border-right:0}
.stat .n{font-family:var(--mono);font-size:2.25rem;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.stat .n.hi{color:var(--accent-text)}
.stat .l{font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-top:.45rem}
@media (max-width:640px){.stats{grid-template-columns:1fr 1fr}.stat:nth-child(2){border-right:0}.stat:nth-child(-n+2){border-bottom:1px solid var(--line)}}

.headlines{margin:1.4rem 0 0;padding:0;list-style:none;display:grid;gap:.35rem}
.headlines li{display:grid;grid-template-columns:auto 1fr;gap:.7rem;align-items:baseline;font-size:.95rem}
.headlines .who{font-weight:700}
.headlines .what{color:var(--muted)}
.headlines .cls{font-family:var(--mono);font-size:.8rem;letter-spacing:.04em;color:var(--ink)}

.controls{position:sticky;top:0;z-index:2;background:var(--bg);padding:1rem 0 .8rem;margin:2.4rem 0 0;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
.chips{display:flex;flex-wrap:wrap;gap:.35rem}
.chip{font:inherit;font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:.45rem .7rem;border:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer;border-radius:0}
.chip .c{font-family:var(--mono);font-weight:400;margin-left:.35rem;letter-spacing:0}
.chip[aria-pressed="true"]{background:var(--box-bg);color:var(--box-ink);border-color:var(--box-bg)}
.chip:focus-visible,.search:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.search{font:inherit;font-size:.9rem;margin-left:auto;padding:.45rem .7rem;border:1px solid var(--line);background:var(--bg2);color:var(--ink);min-width:12rem;border-radius:0}
.search::placeholder{color:var(--muted)}
@media (max-width:640px){.search{margin-left:0;width:100%}}

.classhead{display:flex;align-items:stretch;margin:2.6rem 0 0;font-size:1.125rem;font-weight:700;text-transform:uppercase;letter-spacing:.01em}
.classhead .box{background:var(--box-bg);color:var(--box-ink);padding:.32em .55em;font-family:var(--mono);font-variant-numeric:tabular-nums}
.classhead .plain{padding:.32em .6em;color:var(--ink)}
.classhead .plain small{font-size:.75rem;letter-spacing:.06em;color:var(--muted);margin-left:.6em;font-weight:700}
.classhead .status{margin-left:auto;align-self:center;font-size:.72rem;letter-spacing:.08em;color:var(--muted);font-weight:700;white-space:nowrap}
.classhead .plain small{white-space:nowrap}
@media (max-width:640px){.classhead .status{display:none}.classhead .plain small{display:block;margin:0}}
.classhead .status.live{color:var(--accent-text)}

.rows{border-top:1px solid var(--line)}
.row{display:grid;grid-template-columns:3.4rem minmax(0,1fr) 7.5rem 11.5rem 8rem;gap:0 1rem;align-items:center;padding:.8rem 0;border-bottom:1px solid var(--line)}
.row.pending{grid-template-columns:3.4rem minmax(0,1fr) 7.5rem 11.5rem 8rem}
.row.hidden{display:none}
.pos{font-family:var(--mono);font-size:1.75rem;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;text-align:right}
.pos small{display:block;font-size:.65rem;font-weight:700;letter-spacing:.06em;color:var(--muted);margin-top:.25rem}
.pos.t{color:var(--accent-text)}
.pos.grid{color:var(--muted);font-size:1.1rem}
.who .nm{font-weight:700;display:flex;align-items:center;gap:.45rem;flex-wrap:wrap}
.who .car{color:var(--muted);font-size:.9rem;overflow-wrap:anywhere}
.tag{display:inline-block;font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:.18em .45em;background:var(--accent);color:var(--accent-ink);line-height:1.2}
.tag.mute{background:transparent;color:var(--muted);border:1px solid var(--line)}

.field{display:grid;gap:.35rem}
.track{position:relative;height:10px;background:var(--bg2);border:1px solid var(--line)}
.track .zone{position:absolute;left:0;top:0;bottom:0;background:var(--zone);border-right:1px solid var(--accent)}
.track .me{position:absolute;top:-3px;bottom:-3px;width:3px;background:var(--ink);transform:translateX(-50%)}
.track .me.t{background:var(--accent)}
.field .fl{font-family:var(--mono);font-size:.7rem;letter-spacing:.02em;color:var(--muted);display:flex;justify-content:flex-end;font-variant-numeric:tabular-nums;white-space:nowrap;min-height:1em}
.field .fl b{color:var(--ink);font-weight:400}
.field .fl b.in{color:var(--accent-text)}

.times{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:.78rem;line-height:1.5}
.times .tot{font-size:1.1rem;font-weight:700;color:var(--ink);display:block}
.times .runs{color:var(--muted);display:block}
.times .runs .b{color:var(--ink)}
.times .cone{color:var(--grit-text)}
.times .lbl{color:var(--muted);font-family:var(--font);font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;font-weight:700}
.times .sched{font-family:var(--font);font-size:.85rem;color:var(--muted)}
.times .sched b{color:var(--ink)}

.season{font-size:.8rem;line-height:1.4}
.season .lbl{font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);display:block}
.season .s{display:block;white-space:nowrap}
.season .s .pts{font-family:var(--mono);color:var(--muted);font-variant-numeric:tabular-nums}
.season .s.top{color:var(--ink);font-weight:700}
.season .none{color:var(--muted)}

@media (max-width:760px){
  .row,.row.pending{grid-template-columns:3rem minmax(0,1fr) 7.5rem;grid-template-areas:"pos who times" "pos field field" "pos season season";gap:.5rem .8rem}
  .pos{grid-area:pos;align-self:start}.who{grid-area:who}.field{grid-area:field}.times{grid-area:times;text-align:right}.season{grid-area:season}
}

.note{margin:2.6rem 0 0;padding:1.1rem 1.2rem;background:var(--bg2);border-left:3px solid var(--accent);color:var(--muted);font-size:.9rem}
.note b{color:var(--ink)}
h2.sec{font-size:1.375rem;text-transform:uppercase;letter-spacing:.01em;line-height:1.1;margin:3.2rem 0 .3rem}
.sec + p{color:var(--muted);margin:0 0 .5rem;max-width:65ch}
.empty{color:var(--muted);padding:2rem 0;text-align:center;display:none}
footer{margin-top:3.5rem;padding-top:1.2rem;border-top:1px solid var(--line);color:var(--muted);font-size:.8rem;line-height:1.6;max-width:65ch}
footer p{margin:.4rem 0}
@media (prefers-reduced-motion:no-preference){.chip{transition:background .12s,color .12s}}
</style>

<div class="sheet">
  <header>
    <p class="eyebrow">Kansas City Region · 2026 Tire Rack SCCA Solo National Championships · Lincoln, NE</p>
    <h1>KC Region <span class="hi">at Nationals</span></h1>
    <p class="lede" id="lede"></p>
    <div class="meta">
      <span id="asof"></span>
      <a href="https://sololive.scca.com/26NATSGEN/index.php" target="_blank" rel="noopener">Live timing ↗</a>
      <a href="https://www.kcrscca.org/results/solo/2025/2025_kcr_solo_championship_yep.htm" target="_blank" rel="noopener">2025 KCR points ↗</a>
    </div>
  </header>

  <div class="stats" id="stats"></div>
  <ul class="headlines" id="headlines"></ul>

  <div class="controls" role="toolbar" aria-label="Filter drivers">
    <div class="chips" id="chips"></div>
    <input class="search" id="q" type="search" placeholder="Search driver, car, class" aria-label="Search driver, car, or class">
  </div>

  <div id="board"></div>
  <p class="empty" id="empty">No drivers match that filter.</p>

  <h2 class="sec">Points scorers under another flag</h2>
  <p>Drivers on the 2025 KCR championship sheet who entered Nationals under a different region. Shown for the record; they don't count in the tallies above.</p>
  <div id="other"></div>

  <footer>
    <p><b>How to read it.</b> Position is the current class standing from live timing. Each driver gets three runs on the Tuesday/Thursday course and three on the Wednesday/Friday course; the total is the best of each. Trophies go to the top slice of each class, marked T on the timing sheet. “In by” and “out by” compare a driver's total to the last trophy position, so they only mean something once a class has finished the day.</p>
    <p>Positions in classes that haven't run yet are just grid order, not a standing. Cone counts show in parentheses. Results are un-audited until SCCA posts finals.</p>
    <p>Season column is the Kansas City Region 2025 year-end championship (points with drops, final sheet dated <span id="kcrdate"></span>). Drivers without a season line didn't score KCR points in 2025.</p>
  </footer>
</div>

<script id="data" type="application/json">''' + DATA + r'''</script>
<script>
(function(){
  const D = JSON.parse(document.getElementById('data').textContent);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const f3 = n => n.toFixed(3);
  const ord = n => { const s=['th','st','nd','rd'], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };

  const E = D.entries, C = D.classes;
  const ran = E.filter(e => e.ran), trophy = E.filter(e => e.trophy), pending = E.filter(e => !e.ran);
  const classesRun = D.order.filter(k => C[k].ran && E.some(e => e.cls === k)).length;
  const classesAll = D.order.filter(k => E.some(e => e.cls === k)).length;

  document.getElementById('asof').textContent = 'Timing snapshot ' + D.asof + ' CT · page built ' + D.generated;
  document.getElementById('kcrdate').textContent = D.kcrDate;
  document.getElementById('lede').innerHTML =
    '<b>' + E.length + ' drivers</b> from Kansas City Region are entered across <b>' + classesAll + ' classes</b>. ' +
    (ran.length ? '<b>' + ran.length + '</b> have run their first course; <b>' + trophy.length + '</b> of them are sitting in a trophy position going into day two.' : 'None have run yet.');

  document.getElementById('stats').innerHTML = [
    [E.length, 'Entered'], [ran.length, 'Have run'], [trophy.length, 'In trophy spots', 'hi'], [pending.length, 'Still to run']
  ].map(([n,l,c]) => '<div class="stat"><div class="n ' + (c||'') + '">' + n + '</div><div class="l">' + l + '</div></div>').join('');

  // Headlines: best KC standings among drivers who have run, by position then by field size
  const hl = ran.slice().sort((a,b) => a.pos / C[a.cls].ncars - b.pos / C[b.cls].ncars || a.pos - b.pos).slice(0, 4);
  document.getElementById('headlines').innerHTML = hl.map(e => {
    const m = C[e.cls];
    let what = ord(e.pos) + ' of ' + m.ncars + (e.trophy ? ' · trophy position' : '');
    if (e.margin != null) what += e.trophy ? ' · in by ' + f3(e.margin) : ' · ' + f3(e.margin) + ' outside the trophies';
    return '<li><span class="who">' + esc(e.name) + ' <span class="cls">' + esc(e.cls) + '</span></span><span class="what">' + what + '</span></li>';
  }).join('');

  function runs(list){
    if (!list.length) return '';
    return list.map(r => {
      if (r.label) return '<span class="cone">' + esc(r.label) + '</span>';
      const t = f3(r.t) + (r.cones ? '<span class="cone">(' + r.cones + ')</span>' : '');
      return r.best ? '<span class="b">' + t + '</span>' : t;
    }).join(' ');
  }

  function seasonHtml(e){
    if (!e.season.length) return '<span class="lbl">2025 KCR season</span><span class="none">No points scored</span>';
    return '<span class="lbl">2025 KCR season</span>' + e.season.slice(0,3).map((s,i) =>
      '<span class="s' + (i===0 ? ' top' : '') + '" title="' + esc(s.clsname) + ', ' + s.nevents + ' events">' +
      esc(s.cls) + ' ' + esc(s.posText) + ' <span class="pts">' + s.drops + ' pts</span></span>').join('');
  }

  function rowHtml(e){
    const m = C[e.cls];
    const pct = ((e.pos - 0.5) / m.ncars * 100).toFixed(2);
    const zone = (m.trophies / m.ncars * 100).toFixed(2);
    const tags = (e.trophy ? '<span class="tag">Trophy</span>' : '') + (e.flag === 'other-region' ? '<span class="tag mute">' + esc(e.region) + '</span>' : '');
    const who = '<div class="who"><div class="nm">' + esc(e.name) + tags + '</div><div class="car">' + esc(e.vehicle || '—') + ' · ' + esc(e.city) + '</div></div>';
    if (!e.ran) {
      return '<div class="row pending" data-cls="' + esc(e.cls) + '" data-name="' + esc(e.name.toLowerCase()) + '" data-car="' + esc((e.vehicle||'').toLowerCase()) + '" data-state="pending">' +
        '<div class="pos grid">#' + esc(e.car) + '<small>car</small></div>' + who +
        '<div class="field"><div class="track"><div class="zone" style="width:' + zone + '%"></div></div><div class="fl"><span>grid #' + esc(e.car) + '</span></div></div>' +
        '<div class="times"><span class="sched">Runs <b>' + esc(m.day1) + '</b> &amp; <b>' + esc(m.day2) + '</b><br>Heat ' + (m.heat||'—') + '</span></div>' +
        '<div class="season">' + seasonHtml(e) + '</div></div>';
    }
    let margin = '';
    if (e.margin != null) margin = e.trophy ? '<b class="in">in by ' + f3(e.margin) + '</b>' : '<b>' + f3(e.margin) + ' out</b>';
    const gap = e.gap != null ? '+' + f3(e.gap) + ' to P' + (e.pos-1) : (e.pos === 1 ? 'leads' : '');
    const c2 = e.c2.length ? '<span class="runs"><span class="lbl">' + esc(m.day2) + '</span> ' + runs(e.c2) + '</span>' : '';
    return '<div class="row" data-cls="' + esc(e.cls) + '" data-name="' + esc(e.name.toLowerCase()) + '" data-car="' + esc((e.vehicle||'').toLowerCase()) + '" data-state="' + (e.trophy ? 'trophy' : 'ran') + '">' +
      '<div class="pos' + (e.trophy ? ' t' : '') + '">' + e.pos + '<small>of ' + m.ncars + '</small></div>' + who +
      '<div class="field"><div class="track"><div class="zone" style="width:' + zone + '%"></div><div class="me' + (e.trophy ? ' t' : '') + '" style="left:' + pct + '%" title="' + ord(e.pos) + ' of ' + m.ncars + '"></div></div>' +
      '<div class="fl">' + (margin || '<span>' + (e.pos === 1 ? 'leads' : '') + '</span>') + '</div></div>' +
      '<div class="times"><span class="tot">' + (e.total != null ? f3(e.total) : '—') + '</span><span class="runs"><span class="lbl">' + esc(m.day1) + '</span> ' + runs(e.c1) + '</span>' + c2 +
      '<span class="runs">' + gap + (e.toLeader != null && e.pos > 1 ? ' · ' + f3(e.toLeader) + ' off P1' : '') + '</span></div>' +
      '<div class="season">' + seasonHtml(e) + '</div></div>';
  }

  function sectionHtml(k, list){
    const m = C[k];
    const status = m.ran ? '<span class="status live">Day 1 on the board</span>' : '<span class="status">Runs ' + esc(m.day1) + ' · Heat ' + (m.heat||'—') + '</span>';
    return '<section class="cls" data-cls="' + esc(k) + '"><div class="classhead"><div class="box">' + esc(k) + '</div><div class="plain">' + m.ncars + ' cars · ' + m.trophies + ' trophies<small>' + esc(m.groupLabel) + '</small></div>' + status + '</div>' +
      '<div class="rows">' + list.map(rowHtml).join('') + '</div></section>';
  }

  const byCls = {};
  E.forEach(e => (byCls[e.cls] = byCls[e.cls] || []).push(e));
  document.getElementById('board').innerHTML = D.order.filter(k => byCls[k]).map(k => sectionHtml(k, byCls[k])).join('');
  const byClsO = {};
  D.otherRegion.forEach(e => (byClsO[e.cls] = byClsO[e.cls] || []).push(e));
  document.getElementById('other').innerHTML = D.order.filter(k => byClsO[k]).map(k => sectionHtml(k, byClsO[k])).join('');

  // Filters
  const filters = [['all','All',E.length],['ran','Have run',ran.length],['trophy','Trophy spots',trophy.length],['pending','Still to run',pending.length]];
  let state = 'all', q = '';
  const chips = document.getElementById('chips');
  chips.innerHTML = filters.map(([k,l,n]) => '<button class="chip" type="button" data-f="' + k + '" aria-pressed="' + (k===state) + '">' + l + '<span class="c">' + n + '</span></button>').join('');
  chips.addEventListener('click', ev => {
    const b = ev.target.closest('.chip'); if (!b) return;
    state = b.dataset.f;
    chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === b));
    apply();
  });
  document.getElementById('q').addEventListener('input', ev => { q = ev.target.value.trim().toLowerCase(); apply(); });

  function apply(){
    let shown = 0;
    document.querySelectorAll('#board .row').forEach(r => {
      const s = r.dataset.state;
      const okState = state === 'all' || (state === 'ran' ? s !== 'pending' : s === state);
      const okQ = !q || r.dataset.name.includes(q) || r.dataset.car.includes(q) || r.dataset.cls.toLowerCase().includes(q);
      const ok = okState && okQ; r.classList.toggle('hidden', !ok); if (ok) shown++;
    });
    document.querySelectorAll('#board section.cls').forEach(s => { s.hidden = !s.querySelector('.row:not(.hidden)'); });
    document.getElementById('empty').style.display = shown ? 'none' : 'block';
  }
})();
</script>
'''
open('tracker.html', 'w').write(html)
print('wrote tracker.html', len(html))

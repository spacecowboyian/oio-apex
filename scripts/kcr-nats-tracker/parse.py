import re, json, html, glob, os
from html.parser import HTMLParser

def strip(s):
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s).replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', s).strip()

# ---------- Nationals ----------
def parse_class(path):
    cls = os.path.basename(path).replace('.php', '')
    src = open(path, encoding='latin-1').read()
    m = re.search(r'Class standings for (\w+) \[(\d+) Cars\] \(([^)]*)\)', src)
    ncars = int(m.group(2)) if m else 0
    asof = m.group(3) if m else ''
    grp = re.search(r'2026 (\w+) Tire Rack', src)
    group = grp.group(1) if grp else ''
    # split into TR blocks
    rows = re.findall(r'<TR([^>]*)>(.*?)</TR>', src, re.S)
    entries = []
    i = 0
    while i < len(rows):
        attrs, body = rows[i]
        tds = re.findall(r'<TD[^>]*>(.*?)</TD>', body, re.S)
        if len(tds) >= 8 and 'inforow' not in attrs and re.match(r'^\s*(T|)\s*$', strip(tds[0])) and re.match(r'^\d+$', strip(tds[1])) and not re.match(r'^[\d.]+$', strip(tds[2]) or 'x') is None:
            pass
        # main row: tds[1] pos (digits), tds[2] car#, tds[3] name, tds[4] car, tds[5] tire, tds[6] total-so-far
        if 'inforow' not in attrs and len(tds) >= 7 and re.match(r'^\d+$', strip(tds[1])) and strip(tds[3]) and not strip(tds[3]).replace('.','').isdigit():
            pos = int(strip(tds[1])); car = strip(tds[2]); name = strip(tds[3]); vehicle = strip(tds[4]); tire = strip(tds[5]); total = strip(tds[6])
            trophy = strip(tds[0])
            info = rows[i+1][1] if i+1 < len(rows) else ''
            itds = [strip(t) for t in re.findall(r'<TD[^>]*>(.*?)</TD>', info, re.S)]
            region = itds[0] if itds else ''
            city = itds[1] if len(itds) > 1 else ''
            sponsor = itds[2] if len(itds) > 2 else ''
            entries.append(dict(cls=cls, group=group, pos=pos, car=car, name=name, vehicle=vehicle, tire=tire,
                                total=total, trophy=trophy, region=region, city=city, sponsor=sponsor,
                                c1=[], c2=[], gap=''))
            i += 2
        elif entries and 'inforow' not in attrs and ('course1' in body or 'course2' in body):
            e = entries[-1]
            for a, t in re.findall(r'<TD([^>]*)>(.*?)</TD>', body, re.S):
                v = strip(t)
                if 'course1' in a and v: e['c1'].append({'t': v, 'best': '<b>' in t})
                elif 'course2' in a and v: e['c2'].append({'t': v, 'best': '<b>' in t})
                elif v.startswith('('): e['gap'] = v
            i += 1
        else:
            i += 1
    return dict(cls=cls, group=group, ncars=ncars, asof=asof, entries=entries)

classes = {}
for p in sorted(glob.glob('nats/*.php')):
    d = parse_class(p)
    classes[d['cls']] = d

# sanity
tot = sum(len(c['entries']) for c in classes.values())
declared = sum(c['ncars'] for c in classes.values())
print('classes', len(classes), 'entries parsed', tot, 'declared', declared)
for k, c in classes.items():
    if len(c['entries']) != c['ncars']:
        print('MISMATCH', k, len(c['entries']), c['ncars'])

kc = [e for c in classes.values() for e in c['entries'] if e['region'].lower().startswith('kansas city')]
print('KC entries', len(kc))
for e in kc:
    print(f"{e['cls']:6} {e['pos']:>3}/{classes[e['cls']]['ncars']:<3} {e['name']:24} {e['vehicle']:32} {e['total']:>10} {e['region']} | {e['city']} | c1={[x['t'] for x in e['c1']]} c2={[x['t'] for x in e['c2']]} gap={e['gap']}")

# ---------- KCR points ----------
src = open('kcr_points.html', encoding='latin-1').read()
# sections: header cell like "ss - 'Super Street'" then rows
sections = re.split(r"<tr[^>]*>\s*<t[dh][^>]*>\s*(?:<[^>]+>\s*)*([a-z]+) - '([^']*)'", src)
kcr = []
# alternative: iterate rows and track current class
cur = None
for m in re.finditer(r'<tr[^>]*>(.*?)</tr>', src, re.S):
    body = m.group(1)
    hdr = re.search(r"<a name=\"([a-z]+)\"></a>[a-z]+ - '([^']*)'", body)
    if hdr:
        cur = (hdr.group(1), hdr.group(2)); continue
    tds = [strip(t) for t in re.findall(r'<td[^>]*>(.*?)</td>', body, re.S)]
    if cur and len(tds) >= 4 and re.match(r'^\d+T?$', tds[0]):
        pts = tds[4:]
        kcr.append(dict(cls=cur[0].upper(), clsname=cur[1], pos=tds[0], name=tds[1], total=int(tds[2] or 0), drops=int(tds[3] or 0),
                        events=[int(p) if p.isdigit() else None for p in pts], nevents=sum(1 for p in pts if p.isdigit())))
print('KCR drivers', len(kcr))
from collections import Counter
print(Counter(d['cls'] for d in kcr))
json.dump(dict(classes=classes, kcr=kcr), open('data.json', 'w'), indent=1)


# ---------- Run/work order schedule ----------
src = open('nats_index.html', encoding='latin-1').read()
panels = re.findall(r'<!-- (\w+) -->\s*<div class="panel panel-default">(.*?)(?=<!-- \w+ -->\s*<div class="panel panel-default">|</body>)', src, re.S)
sched, labels = {}, {}
for tag, body in panels:
    title = re.search(r'accordion-toggle[^>]*>\s*(?:<!--.*?-->\s*)?([^<\n]+)', body, re.S)
    labels[tag] = html.unescape(title.group(1)).strip() if title else tag
    for m in re.finditer(r'<tr>\s*<td align="center">(\d+)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>', body, re.S | re.I):
        heat = int(m.group(1))
        running = [x.strip().rstrip('*') for x in re.sub(r'<[^>]+>', '', m.group(2)).split(',')]
        working = [x.strip().rstrip('*') for x in re.sub(r'<[^>]+>', '', m.group(3)).split(',')]
        for c in running:
            if c: sched.setdefault(c, {}).update(group=tag, heat=heat)
        for c in working:
            if c: sched.setdefault(c, {}).update(group=tag, workheat=heat)
json.dump(dict(labels=labels, sched=sched), open('sched.json', 'w'), indent=1)
print('schedule classes', len(sched), 'missing:', [k for k in classes if k not in sched or 'heat' not in sched[k]])

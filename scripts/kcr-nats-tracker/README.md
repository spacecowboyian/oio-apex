# KCR at Solo Nats tracker

Builds the "KCR at Solo Nats" artifact page: every Kansas City Region driver
entered at the 2026 Tire Rack SCCA Solo National Championships, their live class
standing, run breakdown, margin to the trophy line, and their 2025 KCR
year-end championship points.

Sources
- Live timing: https://sololive.scca.com/26NATSGEN/index.php (one `<CLASS>.php` page per class)
- Season points: https://www.kcrscca.org/results/solo/2025/2025_kcr_solo_championship_yep.htm

Refresh (from this directory):

```sh
curl -sSL https://sololive.scca.com/26NATSGEN/index.php -o nats_index.html
curl -sSL https://www.kcrscca.org/results/solo/2025/2025_kcr_solo_championship_yep.htm -o kcr_points.html
mkdir -p nats
for c in $(grep -o 'href="[A-Z]*\.php"' nats_index.html | sort -u | sed 's/href="//;s/"//'); do
  curl -sSL "https://sololive.scca.com/26NATSGEN/$c" -o "nats/$c" &
done; wait
python3 parse.py     # -> data.json (all classes + KCR points)
python3 build.py     # -> tracker.html, republish to the same artifact URL
```

`parse.py` also writes `sched.json`, which `build.py` reads; the schedule
(run group + heat per class) is parsed from the index page's run/work order
tables. Drivers are matched to the points sheet by normalized name.

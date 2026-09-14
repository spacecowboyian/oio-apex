/**
 * Per-shot audio treatment, in the same pass as the warp.
 *
 * What this is for, from measuring real X1 in-cabin footage rather than from
 * general practice:
 *
 *   The camera's own master runs about -9.2 LUFS - far too hot - and once the
 *   car is moving, broadband roar fills 200 Hz to 16 kHz and buries the voices.
 *   The engine sits at 20-170 Hz, speech in harmonic combs at 300-4000 Hz.
 *
 * Two things were tried first and are deliberately NOT here:
 *
 *   `afftdn` at light settings measured as a no-op - speech share 66.9% before
 *   and 66.9% after. It tracks a STATIONARY noise floor, and this roar is not
 *   stationary, so there is nothing for it to learn.
 *
 *   A single full-band compressor made it WORSE: it hears one level for the
 *   whole spectrum, so it lifted the quiet low end and the engine's share went
 *   7.9% to 14.8% while the speech-to-roar ratio fell 0.6 dB. The thing that
 *   needs different treatment per frequency needs a filter that works per
 *   frequency.
 *
 * `arnndn` is also absent on purpose: its models are speech-trained and treat
 * the engine as the noise, which removes the thing most worth keeping.
 *
 * So: split at 200 Hz and 4 kHz, treat each part for what it is, remix.
 * Measured on the MGB sample, this takes speech-to-roar from 5.8 dB to 18.5 dB.
 */

/**
 * Defaults are the settings Ian picked by ear (variant "4e"), against five
 * alternatives at matched loudness.
 *
 * `notch` is OFF by default and that is the important default. The 12.4 kHz
 * squeak it exists for is specific to ONE car: on the same X1 body the MGB puts
 * 69% of its above-4 kHz energy in 11-14 kHz, the Fit puts 16%, and the X4
 * puts 0.7%. Notching by default would carve a hole in every car's audio to fix
 * one car's whistle.
 */
export const AUDIO_DEFAULTS = {
  // On for every clip. The masking problem is a property of filming a car from
  // inside it, not of any one car, so it is the default rather than a flag
  // someone has to remember.
  enabled: true,
  // below 200 Hz: the engine. Gently levelled, never pulled down - this is the
  // part that carries the weight of the shot.
  lowGain: 1.0,
  lowRatio: 2,
  // 200 Hz - 4 kHz: voices and engine harmonics. Lifted, and NOT compressed,
  // so the thing being rescued does not get squashed in the rescuing.
  voiceGain: 1.6,
  // above 4 kHz: roar. Compressed hard and pulled back.
  highGain: 0.9,
  highRatio: 6,
  // Narrowband cut, for a car with a whistle. `"auto"` measures the clip and
  // notches only when the whistle is actually there - see `detectWhistle`.
  // An explicit object forces it; null disables it.
  notch: "auto",
  // The master is ~-9.2 LUFS. Everything lands here instead.
  loudness: { i: -16, tp: -1.5, lra: 11 },
  // Nothing lives below this and rumble costs bitrate.
  highpass: 35,
};

export function audioIsIdentity(a = {}) {
  return !{ ...AUDIO_DEFAULTS, ...a }.enabled;
}

/**
 * Does this clip have the narrowband whistle?
 *
 * Measured, not assumed, because it is a property of one car rather than of the
 * camera: on the SAME X1 body the MGB puts 69% of its above-4 kHz energy into
 * 11-14 kHz, the Fit 16%, and the X4 0.7%. A fixed default would either miss
 * the MGB or cut a hole in everything else, so the clip is asked.
 *
 * Two `volumedetect` passes over a 60 s sample - one band-limited to 11-14 kHz,
 * one to the whole 4-20 kHz range - and their ratio is the share. Cheap
 * (audio-only decode, no video) and it uses ffmpeg's own measurement rather
 * than reimplementing an FFT here.
 */
/**
 * Real FFT of a power-of-two block, in place. Iterative radix-2.
 *
 * Hand-rolled because this measurement decides whether a permanent notch gets
 * cut into someone's audio, and the two cheaper routes both gave wrong answers:
 * a single ffmpeg bandpass is 12 dB/octave and leaks so much of the (far
 * louder) rest of the spectrum that the MGB read 36% against an FFT's 69%,
 * while cascading filters steep enough to stop the leak eats the passband -
 * the band is only ~0.35 octaves wide, so 72 dB/octave slopes from both corners
 * meet in the middle and every clip read under 1%. A transform has no corners.
 */
function fft(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/**
 * Does this clip have the narrowband whistle?
 *
 * Measured per clip, not assumed, because it belongs to one car rather than to
 * the camera: on the SAME X1 body the MGB puts ~69% of its above-4 kHz energy
 * into 11-14 kHz, the Fit ~16%, and the X4 ~0.7%. A fixed default would either
 * miss the MGB or cut a hole in every other car.
 */
export async function detectWhistle(clip, { at = 60, seconds = 60, threshold = 40 } = {}) {
  const { run } = await import("./util.mjs");
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = (await import("node:path")).default;

  const SR = 48000, N = 4096;
  const dir = await mkdtemp(path.join(tmpdir(), "360framer-whistle-"));
  const raw = path.join(dir, "a.raw");
  try {
    const r = await run("ffmpeg", [
      "-v", "error", "-ss", String(at), "-t", String(seconds), "-i", clip,
      "-vn", "-ac", "1", "-ar", String(SR), "-f", "s16le", raw, "-y",
    ]);
    if (r.code !== 0) return { present: false, share: null, reason: "no readable audio" };
    const buf = await readFile(raw);
    const pcm = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2));
    if (pcm.length < N * 4) return { present: false, share: null, reason: "too little audio" };

    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const binOf = (hz) => Math.round((hz / SR) * N);
    const lo14 = binOf(11000), hi14 = binOf(14000);
    const lo4 = binOf(4000), hi20 = binOf(20000);

    let band = 0, all = 0;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let off = 0; off + N <= pcm.length; off += N) {
      for (let i = 0; i < N; i++) { re[i] = (pcm[off + i] / 32768) * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = lo4; k <= hi20; k++) {
        const p = re[k] * re[k] + im[k] * im[k];
        all += p;
        if (k >= lo14 && k <= hi14) band += p;
      }
    }
    if (all <= 0) return { present: false, share: null, reason: "silent" };
    const share = (100 * band) / all;
    return { present: share >= threshold, share, reason: null };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const n = (v) => Number(v).toFixed(2).replace(/\.?0+$/, "");

/**
 * The audio filtergraph for one shot.
 *
 * Returned as a filter_complex fragment rather than an `-af` chain because
 * `acrossover` has three outputs, and a chain cannot branch. Callers splice it
 * into the same graph as the video.
 *
 * @param src   input label carrying the audio, e.g. "0:a:0"
 * @param out   label to produce
 * @returns {string|null} graph fragment, or null when the block is a no-op
 */
export function audioGraph(audio = {}, { src = "0:a:0", out = "a" } = {}) {
  const a = { ...AUDIO_DEFAULTS, ...audio };
  if (!a.enabled) return null;

  const L = { ...AUDIO_DEFAULTS.loudness, ...(a.loudness ?? {}) };
  // Single-pass loudnorm: it adapts as it goes rather than measuring the file
  // first. A two-pass measure would be more exact, but it doubles the read of a
  // multi-gigabyte master to buy a fraction of a LU on material whose whole
  // point is that it is wildly dynamic.
  const norm = `loudnorm=I=${n(L.i)}:TP=${n(L.tp)}:LRA=${n(L.lra)}`;

  // Two overlapping bells rather than one: a single bell is deep only at its
  // centre, and the whistle occupies a slice, not a point.
  let notch = "";
  if (a.notch?.f) {
    const w = Number(a.notch.width ?? 3000);
    const g = Number(a.notch.depth ?? -30);
    const f = Number(a.notch.f);
    const half = w / 4;
    notch =
      `equalizer=f=${n(f - half)}:t=h:w=${n(w / 2)}:g=${n(g)},` +
      `equalizer=f=${n(f + half)}:t=h:w=${n(w / 2)}:g=${n(g)},`;
  }

  return (
    `[${src}]highpass=f=${n(a.highpass)},acrossover=split=200 4000[aL][aM][aH];` +
    `[aL]acompressor=threshold=-24dB:ratio=${n(a.lowRatio)}:attack=20:release=300,` +
    `volume=${n(a.lowGain)}[aLo];` +
    `[aM]volume=${n(a.voiceGain)}[aMo];` +
    `[aH]${notch}acompressor=threshold=-30dB:ratio=${n(a.highRatio)}:attack=5:release=120,` +
    `volume=${n(a.highGain)}[aHo];` +
    // normalize=0 keeps the three bands at the levels just set; amix's default
    // would divide by the input count and undo them.
    `[aLo][aMo][aHo]amix=inputs=3:normalize=0,${norm}[${out}]`
  );
}

/** The settings that fixed the MGB whistle, for a shot that needs them. */
export const MGB_WHISTLE = { f: 12500, width: 3000, depth: -30 };

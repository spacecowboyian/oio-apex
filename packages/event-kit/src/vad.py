#!/usr/bin/env python3
"""
Speech gate for event clips. Decides whether a clip is worth transcribing.

WHY THIS EXISTS: whisper hallucinates confidently over engine noise and wind.
The classic failure is a clean "Thanks for watching!" transcribed from a clip
containing no speech at all. Most rallycross audio is exhaust and gravel, so
running whisper ungated across an event manufactures phantom dialogue.

This is a HEURISTIC gate, not a trained VAD (no webrtcvad/torch on this box).
It leans on three signals that separate speech from steady machine noise:

  1. band ratio    - speech energy concentrates in 300-3400 Hz; exhaust rumble
                     sits lower and wind is broadband.
  2. flatness      - speech is harmonic/peaky (low spectral flatness); noise is
                     flat (high flatness).
  3. modulation    - the load-bearing one. Speech amplitude swings at the
                     syllable rate, 2-8 Hz. A steady engine does not. This is
                     what actually rejects a loud-but-speechless clip, which
                     energy thresholds alone never will.

MEASURED, not guessed (2026-07-22, two real OIO clips):

                        modulation  speech_ratio  band_ratio  flatness
  rallycross run         0.222        0.294        0.457       0.565   <- NO speech
  Keegan talking         0.450        0.227        0.418       0.528   <- speech

Only `modulation` separates them. `speech_ratio` and `band_ratio` are actually
HIGHER on the engine clip, so any gate built on loudness or band energy alone
passes it. Hence MOD_THRESHOLD sits between the two measured values.

Ground truth for the engine clip: ungated whisper transcribed it as
"That's all for now. Thanks for watching. I'll see you in the next one.
Bye bye." — textbook hallucination from a clip with no speech in it.

Only two samples so far. Retune MOD_THRESHOLD as more event audio arrives.

Usage: vad.py <audio.wav> [--min-speech 0.4] [--modulation 0.32]
Outputs JSON: {speech_seconds, speech_ratio, modulation, flatness, is_speech}
"""
import sys, json, wave, argparse
import numpy as np


def load_wav_mono(path):
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        n = w.getnframes()
        raw = w.readframes(n)
        width = w.getsampwidth()
        ch = w.getnchannels()
    dtype = {1: np.int8, 2: np.int16, 4: np.int32}.get(width)
    if dtype is None:
        raise SystemExit(f"unsupported sample width {width}")
    x = np.frombuffer(raw, dtype=dtype).astype(np.float64)
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    peak = float(np.max(np.abs(x))) or 1.0
    return x / peak, sr


def frame(x, sr, win_ms=25.0, hop_ms=10.0):
    win = int(sr * win_ms / 1000)
    hop = int(sr * hop_ms / 1000)
    if len(x) < win:
        return np.empty((0, win)), hop
    idx = np.arange(0, len(x) - win + 1, hop)
    frames = np.stack([x[i:i + win] for i in idx])
    return frames * np.hanning(win), hop


# Sits between the measured engine (0.222) and speech (0.450) values, nearer the
# noise side so a quiet talker still passes. See module docstring.
MOD_THRESHOLD = 0.32


def analyze(path, min_speech=0.4, mod_threshold=MOD_THRESHOLD):
    x, sr = load_wav_mono(path)
    frames, hop = frame(x, sr)
    hop_s = hop / sr
    if frames.shape[0] < 8:
        return dict(speech_seconds=0.0, speech_ratio=0.0, modulation=0.0,
                    flatness=1.0, is_speech=False, reason="too short")

    mag = np.abs(np.fft.rfft(frames, axis=1)) + 1e-12
    freqs = np.fft.rfftfreq(frames.shape[1], 1.0 / sr)

    speech_band = (freqs >= 300) & (freqs <= 3400)
    full_band = (freqs >= 50) & (freqs <= 8000)

    band_energy = mag[:, speech_band].sum(axis=1)
    full_energy = mag[:, full_band].sum(axis=1) + 1e-12
    band_ratio = band_energy / full_energy

    sb = mag[:, speech_band]
    flatness = np.exp(np.log(sb).mean(axis=1)) / (sb.mean(axis=1) + 1e-12)

    # Noise floor from the quietest quartile, so a loud clip doesn't self-gate.
    energy_db = 20 * np.log10(band_energy + 1e-12)
    floor = np.percentile(energy_db, 25)
    loud = energy_db > (floor + 6.0)

    voiced = loud & (band_ratio > 0.35) & (flatness < 0.55)
    speech_seconds = float(voiced.sum() * hop_s)
    speech_ratio = float(voiced.mean())

    # Syllable-rate modulation of the speech-band envelope (2-8 Hz).
    env = band_energy - band_energy.mean()
    if np.allclose(env, 0):
        modulation = 0.0
    else:
        env_fft = np.abs(np.fft.rfft(env))
        env_freqs = np.fft.rfftfreq(len(env), hop_s)
        syl = (env_freqs >= 2) & (env_freqs <= 8)
        total = env_fft[env_freqs <= 20].sum() + 1e-12
        modulation = float(env_fft[syl].sum() / total)

    is_speech = bool(speech_seconds >= min_speech and modulation > mod_threshold and speech_ratio > 0.06)

    return dict(
        speech_seconds=round(speech_seconds, 3),
        speech_ratio=round(speech_ratio, 4),
        modulation=round(modulation, 4),
        flatness=round(float(flatness.mean()), 4),
        band_ratio=round(float(band_ratio.mean()), 4),
        is_speech=is_speech,
        reason="ok",
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wav")
    ap.add_argument("--min-speech", type=float, default=0.4,
                    help="minimum voiced seconds required to pass the gate")
    ap.add_argument("--modulation", type=float, default=MOD_THRESHOLD,
                    help="syllable-rate modulation threshold (the real discriminator)")
    args = ap.parse_args()
    print(json.dumps(analyze(args.wav, args.min_speech, args.modulation)))


if __name__ == "__main__":
    main()

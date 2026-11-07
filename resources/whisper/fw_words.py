# Word timings with an already installed faster-whisper (e.g. C:\AI\Transcribe), for USP Stories.
# Usage: python fw_words.py <model dir> <audio wav> <language|auto> <out.json> [cuda dll dir]
import json, os, sys

model_dir, audio, lang, out = sys.argv[1:5]
cuda = sys.argv[5] if len(sys.argv) > 5 else ""
if cuda and os.path.isdir(cuda):
    os.add_dll_directory(cuda)
    os.environ["PATH"] = cuda + os.pathsep + os.environ.get("PATH", "")

from faster_whisper import WhisperModel


def run(device, compute):
    m = WhisperModel(model_dir, device=device, compute_type=compute)
    segs, _ = m.transcribe(audio, language=None if lang == "auto" else lang, beam_size=5, word_timestamps=True)
    return [{"text": w.word, "start": round(w.start, 3), "end": round(w.end, 3)} for s in segs for w in (s.words or [])]


try:
    words = run("cuda", "float16")
except Exception as e:  # no CUDA libraries or no GPU memory: the processor is slower but works
    print(f"faster-whisper: GPU unavailable ({e}); using CPU", file=sys.stderr)
    words = run("cpu", "int8")
json.dump({"words": words}, open(out, "w", encoding="utf-8"), ensure_ascii=False)

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { parseVoiceFill, speechSupported } from '../lib/voiceFill.js';

const LANGS = [
  { id: 'el-GR', label: 'EL' },
  { id: 'en-US', label: 'EN' },
];

const COPY = {
  'el-GR': {
    listen: 'Ακούω…',
    dictate: 'Υπαγόρευση',
    stopAria: 'Διακοπή υπαγόρευσης',
    startAria: 'Υπαγόρευση',
    langGroup: 'Γλώσσα υπαγόρευσης',
    unsupportedBtn: 'Η υπαγόρευση χρειάζεται Chrome ή Safari (και άδεια μικροφώνου).',
    unsupported: 'Ο browser δεν υποστηρίζει υπαγόρευση. Δοκιμάστε Chrome ή Safari.',
    micDenied: 'Επιτρέψτε το μικρόφωνο για υπαγόρευση.',
    failed: 'Η υπαγόρευση απέτυχε. Ξαναδοκιμάστε.',
    hint: 'π.χ. «επώνυμο Βασιλόπουλος όνομα Γιώργος» · «ημερομηνία γέννησης 12 Μαρτίου 1985» · «email maria παπάκι gmail τελεία com»',
    heardNone: (text) => `Άκουσα «${text}» — πείτε π.χ. «επώνυμο Βασιλόπουλος» ή “last name Smith”.`,
    filled: (labels) => `Συμπληρώθηκε: ${labels}`,
    skipped: (labels) => `Δεν αναγνωρίστηκε: ${labels}. Για ημερομηνία πείτε π.χ. «12 Μαρτίου 1985» ή «12/3/1985».`,
  },
  'en-US': {
    listen: 'Listening…',
    dictate: 'Dictate',
    stopAria: 'Stop dictation',
    startAria: 'Dictate',
    langGroup: 'Dictation language',
    unsupportedBtn: 'Dictation needs Chrome or Safari (and microphone permission).',
    unsupported: 'This browser does not support dictation. Try Chrome or Safari.',
    micDenied: 'Allow the microphone to dictate.',
    failed: 'Dictation failed. Try again.',
    hint: 'e.g. “last name Smith first name George” · “date of birth 12 March 1985” · “email john at gmail dot com”',
    heardNone: (text) => `Heard “${text}” — try e.g. “last name Smith” or «επώνυμο Βασιλόπουλος».`,
    filled: (labels) => `Filled: ${labels}`,
    skipped: (labels) => `Not recognised: ${labels}. For a date try “12 March 1985” or “12/3/1985”.`,
  },
};

function loadLang() {
  try {
    return sessionStorage.getItem('voice-fill-lang') === 'en-US' ? 'en-US' : 'el-GR';
  } catch {
    return 'el-GR';
  }
}

// Chrome will not reliably restart a recognizer that has already produced a
// result, so every take gets a fresh one. The previous instance is torn down
// first — handlers detached and aborted — because Chrome keeps the microphone
// attached to whichever object opened it, and a leftover instance that still
// fires events was what used to lock up the form.
const MAX_SESSION_MS = 20000;

export default function VoiceFill({ onApply, defaultLang }) {
  const [lang, setLang] = useState(() => defaultLang || loadLang());
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const recRef = useRef(null);
  const watchdogRef = useRef(null);
  // Bumped for every take, so events from a previous recognizer are ignored
  // instead of overwriting the state of the one that is running now.
  const takeRef = useRef(0);
  const applyRef = useRef(onApply);
  applyRef.current = onApply;
  const supported = speechSupported();
  const t = COPY[lang] || COPY['el-GR'];

  const release = () => {
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    rec.onstart = null; rec.onend = null; rec.onerror = null; rec.onresult = null;
    try { rec.abort(); } catch { /* already gone */ }
  };

  useEffect(() => () => {
    clearTimeout(watchdogRef.current);
    takeRef.current += 1;
    release();
  }, []);
  useEffect(() => { try { sessionStorage.setItem('voice-fill-lang', lang); } catch { /* ignore */ } }, [lang]);
  useEffect(() => {
    if (defaultLang && (defaultLang === 'el-GR' || defaultLang === 'en-US')) {
      try { if (!sessionStorage.getItem('voice-fill-lang')) setLang(defaultLang); } catch { setLang(defaultLang); }
    }
  }, [defaultLang]);

  const finish = () => {
    clearTimeout(watchdogRef.current);
    setListening(false);
  };

  const start = () => {
    const copy = COPY[lang] || COPY['el-GR'];
    setMsg(''); setOk(false); setHeard('');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMsg(copy.unsupported);
      return;
    }

    // Hand the microphone back before asking for it again.
    clearTimeout(watchdogRef.current);
    release();
    const take = (takeRef.current += 1);
    const live = () => takeRef.current === take;

    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onend = () => { if (live()) finish(); };
    rec.onerror = (e) => {
      if (!live()) return;
      finish();
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setMsg(copy.micDenied);
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setMsg(copy.failed);
    };
    rec.onresult = (ev) => {
      if (!live()) return;
      let finalText = '';
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const tx = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += tx;
        else interim += tx;
      }
      const shown = (finalText || interim).trim();
      if (shown) setHeard(shown);
      if (!finalText.trim()) return;
      const parsed = parseVoiceFill(finalText);
      const en = lang.startsWith('en');
      const missed = en ? parsed.unresolvedLabelsEn : parsed.unresolvedLabels;
      if (!Object.keys(parsed.patches).length) {
        setMsg(missed.length ? copy.skipped(missed.join(', ')) : copy.heardNone(finalText.trim()));
        setOk(false);
        return;
      }
      applyRef.current?.(parsed.patches);
      const filled = copy.filled((en ? parsed.labelsEn : parsed.labels).join(', '));
      setOk(!missed.length);
      setMsg(missed.length ? `${filled}. ${copy.skipped(missed.join(', '))}` : filled);
    };
    recRef.current = rec;

    // Flip the button to "stop" before the engine answers, so a second click
    // always ends the take instead of opening a competing session.
    setListening(true);
    watchdogRef.current = setTimeout(() => { if (live()) { finish(); release(); } }, MAX_SESSION_MS);
    try {
      rec.start();
    } catch {
      finish();
      release();
      setMsg(copy.failed);
    }
  };

  const stop = () => {
    // The engine may still deliver a final result after stop(), and that take
    // is still the live one, so the words the user just said still land.
    finish();
    const rec = recRef.current;
    if (!rec) return;
    try { rec.stop(); } catch { release(); }
  };

  return (
    <div className={`voice-fill${listening ? ' on' : ''}`}>
      <div className="voice-row">
        <button type="button" className={`btn btn-sm${listening ? ' btn-accent' : ''}`}
          onClick={listening ? stop : start} disabled={!supported}
          aria-pressed={listening} aria-label={listening ? t.stopAria : t.startAria}>
          <Icon name="mic" size={15} />
          {listening ? t.listen : t.dictate}
        </button>
        <div className="voice-langs" role="group" aria-label={t.langGroup}>
          {LANGS.map((l) => (
            <button key={l.id} type="button" className={`voice-lang${lang === l.id ? ' active' : ''}`}
              onClick={() => setLang(l.id)} disabled={listening}>{l.label}</button>
          ))}
        </div>
      </div>
      {!supported && <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{t.unsupportedBtn}</div>}
      {heard && <div className="voice-heard">«{heard}»</div>}
      {msg && <div className={`voice-msg${ok ? ' ok' : ''}`}>{msg}</div>}
      <div className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>{t.hint}</div>
    </div>
  );
}

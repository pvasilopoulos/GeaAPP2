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

// Chrome keeps a speech session attached to the object that opened it, so a new
// recognizer per click leaves the previous one holding the microphone and still
// firing events. One instance is created per mount and reused for every take.
const MAX_SESSION_MS = 20000;

export default function VoiceFill({ onApply, defaultLang }) {
  const [lang, setLang] = useState(() => defaultLang || loadLang());
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const recRef = useRef(null);
  const watchdogRef = useRef(null);
  // Handlers are attached once, so they read the live language and callback
  // through refs instead of closing over the values of the first render.
  const langRef = useRef(lang);
  const applyRef = useRef(onApply);
  langRef.current = lang;
  applyRef.current = onApply;
  const supported = speechSupported();
  const t = COPY[lang] || COPY['el-GR'];

  useEffect(() => () => {
    clearTimeout(watchdogRef.current);
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    rec.onstart = null; rec.onend = null; rec.onerror = null; rec.onresult = null;
    try { rec.abort(); } catch { /* already gone */ }
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

  const getRecognition = () => {
    if (recRef.current) return recRef.current;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onend = finish;
    rec.onerror = (e) => {
      finish();
      const copy = COPY[langRef.current] || COPY['el-GR'];
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setMsg(copy.micDenied);
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setMsg(copy.failed);
    };
    rec.onresult = (ev) => {
      const copy = COPY[langRef.current] || COPY['el-GR'];
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
      const en = langRef.current.startsWith('en');
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
    return rec;
  };

  const start = () => {
    const copy = COPY[lang] || COPY['el-GR'];
    setMsg(''); setOk(false); setHeard('');
    const rec = getRecognition();
    if (!rec) {
      setMsg(copy.unsupported);
      return;
    }
    rec.lang = lang;
    // Flip the button to "stop" before the engine answers, so a second click
    // always ends the take instead of opening a competing session.
    setListening(true);
    clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      finish();
      try { rec.abort(); } catch { /* already gone */ }
    }, MAX_SESSION_MS);
    try {
      rec.start();
    } catch {
      // The engine still had a session open: close it so the next click is clean.
      finish();
      try { rec.abort(); } catch { /* already gone */ }
      setMsg(copy.failed);
    }
  };

  const stop = () => {
    finish();
    const rec = recRef.current;
    if (!rec) return;
    // stop() keeps whatever was already recognised; abort() is the fallback.
    try { rec.stop(); } catch { try { rec.abort(); } catch { /* already gone */ } }
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

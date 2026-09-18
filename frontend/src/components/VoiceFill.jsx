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
    already: 'Η υπαγόρευση είναι ήδη ενεργή.',
    hint: 'π.χ. «επώνυμο Βασιλόπουλος όνομα Γιώργος» · «όνομα πελάτη Παπαδόπουλος» · «email maria παπάκι gmail τελεία com»',
    heardNone: (text) => `Άκουσα «${text}» — πείτε π.χ. «επώνυμο Βασιλόπουλος» ή “last name Smith”.`,
    filled: (labels) => `Συμπληρώθηκε: ${labels}`,
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
    already: 'Dictation is already running.',
    hint: 'e.g. “last name Smith first name George” · “customer name Vasilopoulos” · “email john at gmail dot com”',
    heardNone: (text) => `Heard “${text}” — try e.g. “last name Smith” or «επώνυμο Βασιλόπουλος».`,
    filled: (labels) => `Filled: ${labels}`,
  },
};

function loadLang() {
  try {
    return sessionStorage.getItem('voice-fill-lang') === 'en-US' ? 'en-US' : 'el-GR';
  } catch {
    return 'el-GR';
  }
}

export default function VoiceFill({ onApply, defaultLang }) {
  const [lang, setLang] = useState(() => defaultLang || loadLang());
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const recRef = useRef(null);
  const supported = speechSupported();
  const t = COPY[lang] || COPY['el-GR'];

  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* ignore */ } }, []);
  useEffect(() => { try { sessionStorage.setItem('voice-fill-lang', lang); } catch { /* ignore */ } }, [lang]);
  useEffect(() => {
    if (defaultLang && (defaultLang === 'el-GR' || defaultLang === 'en-US')) {
      try { if (!sessionStorage.getItem('voice-fill-lang')) setLang(defaultLang); } catch { setLang(defaultLang); }
    }
  }, [defaultLang]);

  const start = () => {
    const copy = COPY[lang] || COPY['el-GR'];
    setMsg(''); setOk(false); setHeard('');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMsg(copy.unsupported);
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onend = () => { setListening(false); recRef.current = null; };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed') setMsg(copy.micDenied);
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setMsg(copy.failed);
    };
    rec.onresult = (ev) => {
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
      const { patches, labels, labelsEn } = parseVoiceFill(finalText);
      if (!Object.keys(patches).length) {
        setMsg(copy.heardNone(finalText.trim()));
        setOk(false);
        return;
      }
      onApply(patches);
      setOk(true);
      setMsg(copy.filled((lang.startsWith('en') ? labelsEn : labels).join(', ')));
    };
    try { rec.start(); } catch { setMsg(copy.already); }
  };

  const stop = () => { try { recRef.current?.stop(); } catch { /* ignore */ } };

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

import { useEffect, useRef } from 'react';
import Icon from '../Icon.jsx';

// The editor stores the constrained HTML subset the backend sanitizes and
// re-renders per channel. Only the tools every rich-text provider understands
// are offered, so nothing here can produce markup a provider would reject.
const TOOLS = [
  { cmd: 'bold', icon: 'bold', title: 'Έντονα (Ctrl+B)' },
  { cmd: 'italic', icon: 'italic', title: 'Πλάγια (Ctrl+I)' },
  { cmd: 'underline', icon: 'underline', title: 'Υπογράμμιση (Ctrl+U)' },
  { cmd: 'strikeThrough', icon: 'strike', title: 'Διαγραφή' },
  { cmd: 'insertUnorderedList', icon: 'list', title: 'Λίστα' },
];

export default function RichTextEditor({ value, onChange, placeholder, ariaLabel }) {
  const ref = useRef(null);

  // Only push external values in when they differ, otherwise every keystroke
  // would reset the caret to the start of the field.
  useEffect(() => {
    const el = ref.current;
    if (el && value !== el.innerHTML) el.innerHTML = value || '';
  }, [value]);

  const emit = () => onChange(ref.current?.innerHTML || '');

  const exec = (cmd) => {
    ref.current?.focus();
    document.execCommand(cmd, false, null);
    emit();
  };

  const addLink = () => {
    const url = window.prompt('Διεύθυνση συνδέσμου (https://…)');
    if (!url) return;
    if (!/^(https?:|mailto:|tel:)/i.test(url)) {
      window.alert('Ο σύνδεσμος πρέπει να ξεκινά με https://, mailto: ή tel:');
      return;
    }
    ref.current?.focus();
    document.execCommand('createLink', false, url);
    emit();
  };

  // Pasting from Word or a browser drags in fonts, colours and tables. Taking
  // the plain text keeps the body inside the subset every provider accepts.
  const onPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
    emit();
  };

  return (
    <div className="rte">
      <div className="rte-tools">
        {TOOLS.map((t) => (
          <button key={t.cmd} type="button" className="rte-btn" title={t.title}
            onMouseDown={(e) => e.preventDefault()} onClick={() => exec(t.cmd)}>
            <Icon name={t.icon} size={15} />
          </button>
        ))}
        <button type="button" className="rte-btn" title="Σύνδεσμος"
          onMouseDown={(e) => e.preventDefault()} onClick={addLink}>
          <Icon name="link" size={15} />
        </button>
        <span className="rte-sep" />
        <button type="button" className="rte-btn" title="Καθαρισμός μορφοποίησης"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('removeFormat')}>
          <Icon name="x" size={15} />
        </button>
      </div>
      <div
        ref={ref}
        className="rte-body"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel || 'Μήνυμα'}
        data-placeholder={placeholder || 'Γράψτε το μήνυμα…'}
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        suppressContentEditableWarning
      />
    </div>
  );
}

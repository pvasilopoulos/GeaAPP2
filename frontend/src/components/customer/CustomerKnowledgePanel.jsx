import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { EmptyState, Skeleton } from '../ui.jsx';
import { formatDateTime } from '../../lib/format.js';

const NOTE_CATEGORIES = [['general', 'Γενικά'], ['sales', 'Πωλήσεις'], ['follow_up', 'Follow-up'], ['contract', 'Σύμβαση'], ['internal', 'Εσωτερικά']];
const DOC_CATEGORIES = [['general', 'Γενικά'], ['contract', 'Συμβάσεις'], ['invoice', 'Τιμολόγια'], ['identity', 'Στοιχεία'], ['other', 'Άλλα']];
const REMINDER_LABELS = { overdue: 'Εκπρόθεσμη', due_soon: 'Λήγει σύντομα', upcoming: 'Προγραμματισμένη' };

export default function CustomerKnowledgePanel({ customerId, kind }) {
  const isNotes = kind === 'notes';
  const qc = useQueryClient();
  const [editor, setEditor] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [archived, setArchived] = useState('0');
  const [dueFilter, setDueFilter] = useState('');
  const notesParams = { limit: 50, q: search || undefined, category: category || undefined, archived, due: dueFilter || undefined };
  const query = useQuery({
    queryKey: isNotes ? ['knowledge', 'notes', customerId, notesParams] : ['knowledge', kind, customerId],
    queryFn: ({ signal }) => isNotes ? api.customerNotes(customerId, notesParams, { signal }) : api.customerDocuments(customerId, { limit: 50 }, { signal }),
  });
  const rows = query.data?.results || [];
  const allTags = useMemo(() => {
    if (!isNotes) return [];
    const set = new Set();
    rows.forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
    return [...set];
  }, [rows, isNotes]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['knowledge', kind, customerId] });
  const upload = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await api.uploadFile(file, customerId);
      await api.createCustomerDocument(customerId, { name: file.name, mime_type: file.type, size_bytes: file.size, url: uploaded.url });
      refresh();
    } finally { setUploading(false); }
  };
  const toggleArchive = async (note) => { await api.updateCustomerNote(customerId, note.id, { is_archived: note.is_archived ? 0 : 1 }); refresh(); };
  return (
    <div className="knowledge-panel">
      <div className="knowledge-header">
        <div><div className="settings-eyebrow">{isNotes ? 'CUSTOMER NOTES' : 'CUSTOMER DOCUMENTS'}</div><h2>{isNotes ? 'Σημειώσεις πελάτη' : 'Έγγραφα πελάτη'}</h2><p>{isNotes ? 'Rich text, υπενθυμίσεις, ετικέτες και αρχείο σε ένα οργανωμένο timeline.' : 'Κεντρικός χώρος για συμβάσεις, τιμολόγια και αρχεία του πελάτη.'}</p></div>
        <div className="knowledge-header-actions">{!isNotes && <><input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,image/*" onChange={upload} /><button className="btn btn-accent" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? <span className="spinner" /> : <Icon name="upload" size={16} />} Ανέβασμα εγγράφου</button></>}{isNotes && <button className="btn btn-accent" onClick={() => setEditor({})}><Icon name="plus" size={16} /> Νέα σημείωση</button>}</div>
      </div>
      {isNotes && (
        <div className="knowledge-filters">
          <div className="knowledge-search"><Icon name="search" size={14} /><input placeholder="Αναζήτηση σε τίτλο ή περιεχόμενο…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select className="settings-control" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Όλες οι κατηγορίες</option>{NOTE_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <select className="settings-control" value={dueFilter} onChange={(e) => setDueFilter(e.target.value)}><option value="">Όλες οι υπενθυμίσεις</option><option value="overdue">Εκπρόθεσμες</option><option value="upcoming">Προσεχείς</option><option value="has_due">Με ημερομηνία</option></select>
          <select className="settings-control" value={archived} onChange={(e) => setArchived(e.target.value)}><option value="0">Ενεργές</option><option value="1">Αρχειοθετημένες</option><option value="all">Όλες</option></select>
        </div>
      )}
      {editor && <NoteEditor customerId={customerId} initial={editor.id ? editor : null} existingTags={allTags} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh(); }} />}
      {query.isLoading ? <div className="knowledge-card"><Skeleton h={70} /><Skeleton h={70} style={{ marginTop: 10 }} /></div> : rows.length === 0 ? <div className="knowledge-card"><EmptyState icon={isNotes ? 'note' : 'file'} title={isNotes ? 'Δεν βρέθηκαν σημειώσεις' : 'Δεν υπάρχουν έγγραφα'} hint={isNotes ? 'Δοκίμασε διαφορετικά φίλτρα ή δημιούργησε μια νέα σημείωση.' : 'Τα έγγραφα θα εμφανίζονται εδώ με metadata και κατηγορία.'} /></div> : (
        <div className="knowledge-grid">{rows.map((row) => isNotes ? <NoteCard key={row.id} note={row} onEdit={() => setEditor(row)} onToggleArchive={() => toggleArchive(row)} onDelete={async () => { if (confirm('Διαγραφή σημείωσης;')) { await api.deleteCustomerNote(customerId, row.id); refresh(); } }} /> : <DocumentCard key={row.id} document={row} />)}</div>
      )}
    </div>
  );
}

function NoteEditor({ customerId, initial, existingTags, onClose, onSaved }) {
  const editorRef = useRef(null);
  const [title, setTitle] = useState(initial?.title || '');
  const [category, setCategory] = useState(initial?.category || 'general');
  const [pinned, setPinned] = useState(!!initial?.is_pinned);
  const [dueAt, setDueAt] = useState(initial?.due_at ? new Date(initial.due_at).toISOString().slice(0, 16) : '');
  const [tags, setTags] = useState((initial?.tags || []).join(', '));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (editorRef.current) editorRef.current.innerHTML = initial?.body_html || initial?.body || ''; }, [initial]);
  const command = (name, value) => { editorRef.current?.focus(); document.execCommand(name, false, value); };
  const save = async (event) => {
    event.preventDefault(); const bodyHtml = editorRef.current?.innerHTML || ''; const body = editorRef.current?.innerText?.trim() || '';
    if (!body) return;
    setBusy(true);
    try {
      const payload = { title, category, is_pinned: pinned, body, body_html: bodyHtml, due_at: dueAt || null, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) };
      if (initial) await api.updateCustomerNote(customerId, initial.id, payload); else await api.createCustomerNote(customerId, payload);
      onSaved();
    } finally { setBusy(false); }
  };
  return <div className="note-editor-card">
    <div className="note-editor-head"><div><h3>{initial ? 'Επεξεργασία σημείωσης' : 'Νέα σημείωση'}</h3><span>Rich text editor · αποθηκεύεται στο ιστορικό πελάτη</span></div><button className="btn btn-icon" type="button" onClick={onClose}><Icon name="x" size={17} /></button></div>
    <form onSubmit={save}><div className="knowledge-form-grid"><input className="settings-control" placeholder="Τίτλος σημείωσης" value={title} onChange={(event) => setTitle(event.target.value)} /><select className="settings-control" value={category} onChange={(event) => setCategory(event.target.value)}>{NOTE_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div className="knowledge-form-grid knowledge-form-grid-meta">
        <label className="knowledge-meta-field"><span>Υπενθύμιση / προθεσμία</span><input type="datetime-local" className="settings-control" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
        <label className="knowledge-meta-field"><span>Ετικέτες (χωρισμένες με κόμμα)</span><input className="settings-control" placeholder="π.χ. VIP, ανανέωση" value={tags} onChange={(event) => setTags(event.target.value)} list="note-tag-suggestions" /></label>
        <datalist id="note-tag-suggestions">{(existingTags || []).map((t) => <option key={t} value={t} />)}</datalist>
      </div>
      <div className="rich-toolbar">{[['bold', 'Έντονα'], ['italic', 'Πλάγια'], ['underline', 'Υπογράμμιση'], ['insertUnorderedList', 'Λίστα']].map(([cmd, label]) => <button type="button" key={cmd} onClick={() => command(cmd)}>{label}</button>)}<button type="button" onClick={() => command('formatBlock', 'h3')}>Τίτλος</button><button type="button" onClick={() => command('removeFormat')}>Καθαρισμός</button></div>
      <div className="rich-editor" ref={editorRef} contentEditable suppressContentEditableWarning data-placeholder="Γράψε τη σημείωση σου…" />
      <div className="note-editor-actions"><label className="settings-check"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /> Καρφίτσωμα στην κορυφή</label><span /><button type="button" className="btn" onClick={onClose}>Άκυρο</button><button className="btn btn-accent" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="check" size={15} />} Αποθήκευση</button></div>
    </form>
  </div>;
}

function NoteCard({ note, onEdit, onDelete, onToggleArchive }) {
  const reminder = note.reminder_state;
  return <article className={`knowledge-note${note.is_pinned ? ' is-pinned' : ''}${note.is_archived ? ' is-archived' : ''}`}>
    <div className="knowledge-note-head">
      <div><h3>{note.title || 'Σημείωση'}</h3><span>{note.author_name || 'Ομάδα'} · {formatDateTime(note.created_at)} · {NOTE_CATEGORIES.find(([key]) => key === note.category)?.[1] || 'Γενικά'}</span></div>
      {note.is_pinned ? <Icon name="bookmark" size={15} /> : null}
    </div>
    {(note.due_at || note.is_archived || (note.tags || []).length > 0) && (
      <div className="knowledge-note-meta">
        {note.due_at && <span className={`note-badge note-badge-${reminder}`}><Icon name="clock" size={12} /> {REMINDER_LABELS[reminder] || 'Υπενθύμιση'} · {formatDateTime(note.due_at)}</span>}
        {note.is_archived && <span className="note-badge note-badge-archived"><Icon name="archive" size={12} /> Αρχειοθετημένη</span>}
        {(note.tags || []).map((t) => <span key={t} className="note-tag">#{t}</span>)}
      </div>
    )}
    <div className="knowledge-note-body" dangerouslySetInnerHTML={{ __html: note.body_html || note.body }} />
    <div className="knowledge-actions">
      <button className="btn btn-sm btn-ghost" onClick={onEdit}><Icon name="edit" size={14} /> Επεξεργασία</button>
      <button className="btn btn-sm btn-ghost" onClick={onToggleArchive}><Icon name={note.is_archived ? 'refresh' : 'archive'} size={14} /> {note.is_archived ? 'Επαναφορά' : 'Αρχειοθέτηση'}</button>
      <button className="btn btn-sm btn-ghost danger-action" onClick={onDelete}><Icon name="x" size={14} /> Διαγραφή</button>
    </div>
  </article>;
}

function DocumentCard({ document }) {
  return <article className="knowledge-document"><div className="knowledge-document-icon"><Icon name="file" size={21} /></div><div><h3>{document.name}</h3><p>{DOC_CATEGORIES.find(([key]) => key === document.category)?.[1] || 'Γενικά'} · {Math.max(1, Math.round((document.size_bytes || 0) / 1024))} KB · {formatDateTime(document.created_at)}</p>{document.description && <span>{document.description}</span>}</div><a className="btn btn-sm" href={document.url} target="_blank" rel="noreferrer"><Icon name="download" size={14} /> Άνοιγμα</a></article>;
}


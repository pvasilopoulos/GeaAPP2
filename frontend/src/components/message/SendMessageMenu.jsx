import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api.js';
import Icon from '../Icon.jsx';
import { MESSAGE_CHANNELS } from '../../lib/channels.js';
import MessageComposer from './MessageComposer.jsx';

export default function SendMessageMenu({ customer, contacts = [], onSent }) {
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState(null);
  const ref = useRef(null);
  const { data } = useQuery({
    queryKey: ['messaging-channels'],
    queryFn: ({ signal }) => api.messagingChannels({ signal }),
  });
  const statuses = data?.channels || [];

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = (id) => {
    setOpen(false);
    setChannelId(id);
  };

  const statusFor = (id) => statuses.find((c) => c.id === id);

  return (
    <>
      <div className="msg-menu-wrap" ref={ref}>
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Icon name="message" size={16} /> Αποστολή μηνύματος <Icon name="chevronDown" size={14} />
        </button>
        {open && (
          <div className="msg-menu" role="menu">
            {MESSAGE_CHANNELS.map((ch) => {
              const st = statusFor(ch.id);
              const off = st && st.enabled === false;
              return (
                <button key={ch.id} type="button" role="menuitem"
                  className={`msg-menu-item${off ? ' dim' : ''}`}
                  onClick={() => pick(ch.id)}>
                  <span className="msg-ch-ico" style={{ background: `${ch.color}18`, color: ch.color }}>
                    <Icon name={ch.icon} size={15} />
                  </span>
                  <span>
                    <b>{ch.label}</b>
                    <small>{off ? 'Απενεργοποιημένο' : st?.configured ? 'Έτοιμο' : 'Καταχώρηση στο ιστορικό'}</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {channelId && (
        <MessageComposer
          customer={customer}
          contacts={contacts}
          channelId={channelId}
          channelStatus={statusFor(channelId)}
          onClose={() => setChannelId(null)}
          onSent={onSent}
        />
      )}
    </>
  );
}

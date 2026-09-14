import { EmptyState } from '../components/ui.jsx';

export default function Placeholder({ title, icon }) {
  return (
    <div>
      <div className="page-head"><h1>{title}</h1></div>
      <div className="card card-pad">
        <EmptyState
          icon={icon}
          title={`${title} — υπό ανάπτυξη`}
          hint="Η ενότητα αυτή θα υλοποιηθεί σε επόμενο κύκλο. Ο πυρήνας εστιάζει στην εμπειρία Πελάτη."
        />
      </div>
    </div>
  );
}

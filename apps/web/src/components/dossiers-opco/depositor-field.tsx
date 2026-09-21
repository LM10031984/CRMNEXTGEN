'use client';
import { useEffect, useState } from 'react';
import { listOpcoDepositors } from '@/server/actions/opco-deposit';

export function DepositorField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [people, setPeople] = useState<Array<{ email: string; name: string }>>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    listOpcoDepositors()
      .then((rows) => {
        if (active) setPeople(rows);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <select
        aria-label="Déposé par"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded border p-1"
      >
        <option value="">Choisir un membre de l’équipe…</option>
        {value && !people.some((p) => p.email === value) && <option value={value}>{value}</option>}
        {people.map((p) => (
          <option key={p.email} value={p.email}>
            {p.name} — {p.email}
          </option>
        ))}
      </select>
      {error && <span role="alert"> Liste indisponible. Rechargez la page.</span>}
    </>
  );
}

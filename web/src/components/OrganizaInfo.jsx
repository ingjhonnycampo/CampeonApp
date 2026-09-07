export default function OrganizaInfo({ torneo }) {
  if (!torneo?.organizador && !torneo?.telefono_organizador) return null;
  return (
    <p className="organiza-info">
      {torneo.organizador && <>Organiza: <strong>{torneo.organizador}</strong></>}
      {torneo.organizador && torneo.telefono_organizador && ' · '}
      {torneo.telefono_organizador && <>Tel: <strong>{torneo.telefono_organizador}</strong></>}
    </p>
  );
}

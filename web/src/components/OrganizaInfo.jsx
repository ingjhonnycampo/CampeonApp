import IconoWhatsapp from './IconoWhatsapp';
import { enlaceWhatsapp } from '../lib/telefono';

export default function OrganizaInfo({ torneo }) {
  if (!torneo?.organizador && !torneo?.telefono_organizador && !torneo?.grupo_whatsapp) return null;
  const enlaceTelefono = enlaceWhatsapp(torneo?.telefono_organizador);

  return (
    <div className="organiza-info">
      {(torneo.organizador || torneo.telefono_organizador) && (
        <p>
          {torneo.organizador && <>Organiza: <strong>{torneo.organizador}</strong></>}
          {torneo.organizador && torneo.telefono_organizador && ' · '}
          {torneo.telefono_organizador && (
            enlaceTelefono ? (
              <a href={enlaceTelefono} target="_blank" rel="noreferrer" className="organiza-info-whatsapp">
                <IconoWhatsapp className="organiza-info-whatsapp-icono" /> {torneo.telefono_organizador}
              </a>
            ) : (
              <>Tel: <strong>{torneo.telefono_organizador}</strong></>
            )
          )}
        </p>
      )}
      {torneo.grupo_whatsapp && (
        <a href={torneo.grupo_whatsapp} target="_blank" rel="noreferrer" className="organiza-info-whatsapp organiza-info-grupo">
          <IconoWhatsapp className="organiza-info-whatsapp-icono" /> Únete al grupo de delegados
        </a>
      )}
    </div>
  );
}

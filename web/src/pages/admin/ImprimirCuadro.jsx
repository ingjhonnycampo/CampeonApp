import { useEffect } from 'react';
import { nombreModalidad } from '../../lib/modalidad';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';
import CuadroBracket from '../../components/CuadroBracket';

export default function ImprimirCuadro() {
  const { torneoId } = useParams();

  useEffect(() => {
    const estilo = document.createElement('style');
    estilo.id = 'imprimir-cuadro-landscape';
    estilo.textContent = '@page { size: letter landscape; margin: 1cm; }';
    document.head.appendChild(estilo);
    return () => estilo.remove();
  }, []);

  const { datos, cargando } = useCargaMinima(async () => {
    const torneo = await api('/torneos/' + torneoId);
    const fases = await api('/fases?torneo_id=' + torneoId);
    const faseEliminatoria = fases.find((f) => f.tipo === 'eliminacion');
    const partidos = faseEliminatoria ? await api(`/fases/${faseEliminatoria.id}/partidos`) : [];
    return { torneo, partidos };
  }, [torneoId]);

  if (cargando || !datos) return <CargaJugador texto="Cargando el cuadro..." />;

  const { torneo, partidos } = datos;

  return (
    <div className="imprimir-page imprimir-page--cuadro">
      <div className="imprimir-barra no-imprimir">
        <Link to="/admin/fixture">← Volver al panel</Link>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <header className="imprimir-jornada-header">
        {torneo.logo_url && <img src={torneo.logo_url} alt="" />}
        <div>
          <span className="imprimir-jornada-eyebrow">{torneo.nombre}</span>
          <h1>Cuadro eliminatorio</h1>
          <p>{nombreModalidad(torneo.modalidad)}</p>
        </div>
      </header>

      {partidos.length === 0 ? (
        <p className="admin-empty">Este campeonato todavía no tiene fase eliminatoria.</p>
      ) : (
        <>
          <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', margin: '0 0 10px' }}>* = el equipo que avanzó en esa llave</p>
          <CuadroBracket partidos={partidos} />
        </>
      )}

      <p className="imprimir-pie">
        {(torneo.organizador || torneo.telefono_organizador) && (
          <>Organiza: {torneo.organizador || '—'} {torneo.telefono_organizador && `· Tel: ${torneo.telefono_organizador}`} — </>
        )}
        Generado el {new Date().toLocaleString('es-CO')} — CampeonApp
      </p>
    </div>
  );
}

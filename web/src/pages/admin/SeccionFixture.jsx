import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useModal } from '../../context/ModalContext';
import ConfiguradorFixture from './ConfiguradorFixture';
import { FaseGrupos, FaseEliminatoria, PartidoFila, TablaPosiciones, HistorialSorteos } from './SeccionFases';

export default function SeccionFixture({ torneo, onCambio }) {
  const modal = useModal();
  const [fases, setFases] = useState([]);
  const [equiposAprobados, setEquiposAprobados] = useState([]);
  const [partidosLiga, setPartidosLiga] = useState([]);
  const [posicionesLiga, setPosicionesLiga] = useState([]);
  const [generandoLiga, setGenerandoLiga] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (torneo && torneo.fixture_generado) cargar(torneo.id);
  }, [torneo?.id, torneo?.fixture_generado]);

  async function cargar(torneoId) {
    const [f, eq] = await Promise.all([
      api('/fases?torneo_id=' + torneoId),
      api('/equipos?torneo_id=' + torneoId)
    ]);
    setFases(f);
    setEquiposAprobados(eq.filter((e) => e.estado === 'aprobado'));
    setVersion((v) => v + 1);

    if (torneo.formato === 'liga') {
      const [p, pos] = await Promise.all([
        api('/partidos?torneo_id=' + torneoId),
        api('/partidos/posiciones?torneo_id=' + torneoId)
      ]);
      setPartidosLiga(p);
      setPosicionesLiga(pos);
    }
  }

  async function generarFixtureLiga() {
    const confirmado = await modal.confirmar({
      titulo: '¿Generar el fixture?',
      mensaje: 'Se arma el calendario todos-contra-todos con los equipos aprobados.',
      textoAceptar: 'Generar fixture'
    });
    if (!confirmado) return;
    setGenerandoLiga(true);
    try {
      const data = await api('/partidos/generar', { method: 'POST', body: JSON.stringify({ torneo_id: torneo.id }) });
      await cargar(torneo.id);
      await modal.exito(`Se generaron ${data.generados} partidos.`);
    } catch (err) {
      await modal.error(err.message, 'No se pudo generar el fixture');
    } finally {
      setGenerandoLiga(false);
    }
  }

  async function sortearLiga(equiposIds, delegadosPresentes) {
    const resultado = await api('/partidos/sorteos', {
      method: 'POST',
      body: JSON.stringify({ torneo_id: torneo.id, equipos_ids: equiposIds, delegados_presentes: delegadosPresentes })
    });
    await cargar(torneo.id);
    return resultado;
  }

  async function reiniciarFixture() {
    const confirmado = await modal.confirmar({
      titulo: '¿Borrar toda la configuración del fixture?',
      mensaje: 'Se elimina el fixture, los grupos y la eliminatoria para volver a configurar desde cero.',
      textoAceptar: 'Borrar y reconfigurar',
      peligro: true
    });
    if (!confirmado) return;
    try {
      await api(`/torneos/${torneo.id}/fixture`, { method: 'DELETE' });
      await onCambio();
    } catch (err) {
      await modal.error(err.message, 'No se pudo borrar la configuración');
    }
  }

  if (!torneo) {
    return (
      <section className="admin-card">
        <h2>Fixture</h2>
        <p className="admin-empty">Elige o crea un campeonato primero.</p>
      </section>
    );
  }

  if (!torneo.fixture_generado) {
    return <ConfiguradorFixture torneo={torneo} onGenerado={onCambio} />;
  }

  const faseGrupos = fases.find((f) => f.tipo === 'grupos');
  const faseEliminatoria = fases.find((f) => f.tipo === 'eliminacion');
  const jornadasLiga = [...new Set(partidosLiga.map((p) => p.jornada))].sort((a, b) => a - b);

  return (
    <div className="admin-fixture-stack">
      <div className="admin-form-linea">
        <Link to={`/admin/imprimir/fixture/${torneo.id}`} target="_blank" className="subida-imagen-btn">
          Imprimir tabla de posiciones{faseEliminatoria ? ' y cuadro' : ''}
        </Link>
        <Link to={`/en-vivo/${torneo.slug}`} className="subida-imagen-btn">
          Ver resultados en vivo (público)
        </Link>
        <Link to="/en-vivo" className="admin-link-imprimir">
          Ver todos los campeonatos en vivo
        </Link>
      </div>

      {torneo.formato === 'liga' ? (
        <section className="admin-card">
          <h2>Fixture y posiciones</h2>

          {partidosLiga.length === 0 ? (
            <>
              <p className="admin-empty">Todavía no hay fixture generado para este campeonato.</p>
              <button type="button" onClick={generarFixtureLiga} disabled={generandoLiga} className="subida-imagen-btn">
                {generandoLiga ? 'Generando...' : 'Generar fixture (todos contra todos)'}
              </button>
            </>
          ) : (
            <>
              {faseEliminatoria && (
                <p className="admin-ayuda">
                  <span className="admin-punto-clasifica" /> resaltado = clasifica a la fase eliminatoria (top {faseEliminatoria.clasifican})
                </p>
              )}
              <div className="admin-tabla-posiciones-wrap">
                <TablaPosiciones
                  tabla={posicionesLiga}
                  clasifican={faseEliminatoria?.clasifican}
                  onSortear={sortearLiga}
                />
              </div>

              <div className="admin-list admin-list--alta">
                {jornadasLiga.map((j) => (
                  <div key={j} className="admin-jornada">
                    <div className="admin-jornada-titulo">
                      <h3>Jornada {j}</h3>
                      <Link to={`/admin/imprimir/jornada/${torneo.id}/${j}`} target="_blank" className="admin-link-imprimir">Imprimir</Link>
                    </div>
                    {partidosLiga.filter((p) => p.jornada === j).map((p) => (
                      <PartidoFila key={p.id} partido={p} onGuardado={() => cargar(torneo.id)} />
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      ) : (
        faseGrupos && <FaseGrupos fase={faseGrupos} equiposAprobados={equiposAprobados} onCambio={() => cargar(torneo.id)} />
      )}

      {faseEliminatoria && <FaseEliminatoria fase={faseEliminatoria} />}

      <HistorialSorteos key={version} torneoId={torneo.id} />

      {!torneo.formato_bloqueado && (
        <section className="admin-card">
          <button type="button" className="publico-quitar" onClick={reiniciarFixture}>Borrar configuración y empezar de nuevo</button>
        </section>
      )}
    </div>
  );
}

import { useState } from 'react';
import { api } from '../../lib/api';
import { useModal } from '../../context/ModalContext';

function esPotenciaDeDos(n) {
  return n >= 2 && (n & (n - 1)) === 0;
}

export default function ConfiguradorFixture({ torneo, onGenerado }) {
  const modal = useModal();
  const [formato, setFormato] = useState('liga');
  const [idaVuelta, setIdaVuelta] = useState(false);
  const [gruposCantidad, setGruposCantidad] = useState(2);
  const [gruposClasifican, setGruposClasifican] = useState(2);
  const [gruposMejoresTerceros, setGruposMejoresTerceros] = useState(0);
  const [gruposIntergrupo, setGruposIntergrupo] = useState(false);
  const [gruposIdaVuelta, setGruposIdaVuelta] = useState(false);
  const [tieneEliminatoria, setTieneEliminatoria] = useState(false);
  const [elimClasifican, setElimClasifican] = useState(4);
  const [elimTercerPuesto, setElimTercerPuesto] = useState(false);
  const [elimModo, setElimModo] = useState('sembrado');
  const [elimIdaVuelta, setElimIdaVuelta] = useState(false);
  const [generando, setGenerando] = useState(false);

  const totalClasificados = formato === 'grupos'
    ? (Number(gruposCantidad) || 0) * (Number(gruposClasifican) || 0) + (Number(gruposMejoresTerceros) || 0)
    : Number(elimClasifican) || 0;

  async function generar(e) {
    e.preventDefault();
    if (tieneEliminatoria && !esPotenciaDeDos(totalClasificados)) {
      await modal.error(
        `Con esos números clasifican ${totalClasificados} equipos a la eliminatoria, y eso no arma un cruce parejo. Ajusta los números para que dé 2, 4, 8 o 16.`,
        'Revisa la configuración'
      );
      return;
    }

    const confirmado = await modal.confirmar({
      titulo: '¿Generar el fixture con esta configuración?',
      mensaje: 'Una vez juegues el primer partido, esta configuración queda bloqueada: no vas a poder cambiar el formato, cuántos clasifican, ni si hay tercer puesto. Solo podrás editar fecha y hora de los partidos.',
      textoAceptar: 'Generar fixture'
    });
    if (!confirmado) return;

    setGenerando(true);
    try {
      const data = await api(`/torneos/${torneo.id}/generar-fixture`, {
        method: 'POST',
        body: JSON.stringify({
          formato,
          ida_vuelta: formato === 'liga' ? idaVuelta : false,
          grupos_cantidad: formato === 'grupos' ? Number(gruposCantidad) : null,
          grupos_clasifican: formato === 'grupos' ? Number(gruposClasifican) : null,
          grupos_mejores_terceros: formato === 'grupos' ? Number(gruposMejoresTerceros) : 0,
          grupos_intergrupo: formato === 'grupos' ? gruposIntergrupo : false,
          grupos_ida_vuelta: formato === 'grupos' ? gruposIdaVuelta : false,
          tiene_eliminatoria: tieneEliminatoria,
          elim_clasifican: formato === 'liga' ? Number(elimClasifican) : null,
          elim_tercer_puesto: elimTercerPuesto,
          elim_modo: elimModo,
          elim_ida_vuelta: tieneEliminatoria ? elimIdaVuelta : false
        })
      });
      await modal.exito(data.aviso || 'El fixture quedó configurado.');
      onGenerado();
    } catch (err) {
      await modal.error(err.message, 'No se pudo generar el fixture');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <section className="admin-card">
      <h2>Configurar el fixture</h2>
      <p className="admin-ayuda">
        Define de una sola vez cómo se va a jugar este campeonato. Apenas se registre el primer resultado, esta
        configuración queda bloqueada — solo se podrá editar fecha y hora de los partidos.
      </p>

      <form onSubmit={generar} className="admin-form">
        <label>¿Cómo se juega la primera fase?
          <select value={formato} onChange={(e) => setFormato(e.target.value)}>
            <option value="liga">Liga (todos contra todos)</option>
            <option value="grupos">Grupos</option>
          </select>
        </label>

        {formato === 'liga' && (
          <label className="admin-checkbox">
            <input type="checkbox" checked={idaVuelta} onChange={(e) => setIdaVuelta(e.target.checked)} />
            Ida y vuelta: cada equipo juega 2 veces contra cada rival (en fechas distintas, no seguidas)
          </label>
        )}

        {formato === 'grupos' && (
          <div className="admin-form-row">
            <label>Número de grupos
              <input type="number" min="2" value={gruposCantidad} onChange={(e) => setGruposCantidad(e.target.value)} />
            </label>
            <label>Clasifican por grupo
              <input type="number" min="1" value={gruposClasifican} onChange={(e) => setGruposClasifican(e.target.value)} />
            </label>
            <label>Mejores terceros (opcional)
              <input type="number" min="0" value={gruposMejoresTerceros} onChange={(e) => setGruposMejoresTerceros(e.target.value)} />
            </label>
          </div>
        )}

        {formato === 'grupos' && (
          <label className="admin-checkbox">
            <input type="checkbox" checked={gruposIntergrupo} onChange={(e) => setGruposIntergrupo(e.target.checked)} />
            Si algún grupo queda con número impar de equipos, que el que descansa cada jornada juegue un partido intergrupo (cuenta para su propia tabla)
          </label>
        )}

        {formato === 'grupos' && (
          <label className="admin-checkbox">
            <input type="checkbox" checked={gruposIdaVuelta} onChange={(e) => setGruposIdaVuelta(e.target.checked)} />
            Ida y vuelta: dentro de cada grupo, cada equipo juega 2 veces contra cada rival (en fechas distintas, no seguidas)
          </label>
        )}

        <label className="admin-checkbox">
          <input type="checkbox" checked={tieneEliminatoria} onChange={(e) => setTieneEliminatoria(e.target.checked)} />
          ¿Habrá fase eliminatoria después?
        </label>

        {tieneEliminatoria && (
          <div className="admin-form-row">
            {formato === 'liga' ? (
              <label>Clasifican en total
                <input type="number" min="2" value={elimClasifican} onChange={(e) => setElimClasifican(e.target.value)} />
              </label>
            ) : (
              <label>Clasifican en total (calculado)
                <input type="number" value={totalClasificados} disabled />
              </label>
            )}
            <label>Primera ronda
              <select value={elimModo} onChange={(e) => setElimModo(e.target.value)}>
                <option value="sembrado">Por posiciones</option>
                <option value="sorteo">Sorteo aleatorio</option>
              </select>
            </label>
            <label className="admin-checkbox">
              <input type="checkbox" checked={elimTercerPuesto} onChange={(e) => setElimTercerPuesto(e.target.checked)} />
              Jugar partido por el 3er puesto
            </label>
            <label className="admin-checkbox">
              <input type="checkbox" checked={elimIdaVuelta} onChange={(e) => setElimIdaVuelta(e.target.checked)} />
              Cada llave a ida y vuelta (la Final y el 3er puesto siempre son a partido único)
            </label>
          </div>
        )}

        {tieneEliminatoria && (
          <p className="admin-ayuda">
            {esPotenciaDeDos(totalClasificados)
              ? `Clasifican ${totalClasificados} equipos a la eliminatoria.`
              : `Clasifican ${totalClasificados} equipos — eso no arma un cruce parejo, debe dar 2, 4, 8 o 16.`}
          </p>
        )}

        <button type="submit" disabled={generando} className="subida-imagen-btn">
          {generando ? 'Generando...' : 'Generar fixture'}
        </button>
      </form>
    </section>
  );
}

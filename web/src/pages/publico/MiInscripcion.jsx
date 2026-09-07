import { useState } from 'react';
import { apiPublico } from '../../lib/api';
import { useModal } from '../../context/ModalContext';
import FormularioInscripcion from '../../components/FormularioInscripcion';
import PieFirma from '../../components/PieFirma';
import OrganizaInfo from '../../components/OrganizaInfo';
import BotonRegresar from '../../components/BotonRegresar';

const ETIQUETAS_ESTADO = {
  pendiente: 'Pendiente de revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado — puedes corregir y volver a enviar'
};

export default function MiInscripcion() {
  const modal = useModal();
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [datos, setDatos] = useState(null);

  const [equipo, setEquipo] = useState(null);
  const [jugadores, setJugadores] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);

  async function buscar(e) {
    e.preventDefault();
    setErrorBusqueda('');
    setBuscando(true);
    try {
      const data = await apiPublico('/inscripcion/' + codigo.trim());
      setDatos(data);
      setEquipo({
        nombre: data.equipo.nombre, delegado: data.equipo.delegado || '',
        delegado_telefono: data.equipo.delegado_telefono || '', escudo_url: data.equipo.escudo_url || ''
      });
      setJugadores(data.jugadores.map((j) => ({ ...j })));
    } catch (err) {
      setErrorBusqueda(err.message);
    } finally {
      setBuscando(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    if (!equipo.nombre) return setError('El nombre del equipo es obligatorio');
    if (!equipo.delegado_telefono) return setError('El teléfono del delegado es obligatorio');
    if (jugadores.some((j) => !j.nombre || !j.fecha_nacimiento || !j.cedula)) {
      return setError('Todos los jugadores necesitan nombre, N° de documento y fecha de nacimiento');
    }

    setEnviando(true);
    try {
      const resultado = await apiPublico(`/inscripcion/${codigo.trim()}`, {
        method: 'PATCH',
        body: JSON.stringify({ equipo, jugadores })
      });
      setDatos({ ...datos, equipo: resultado.equipo });
      setJugadores(resultado.jugadores.map((j) => ({ ...j })));
      setGuardado(true);
      if (resultado.equipo.estado === 'rechazado') {
        await modal.error(resultado.equipo.motivo_rechazo, 'Se guardó, pero aún falta corregir algo');
      } else {
        await modal.exito('Los cambios quedaron guardados y la planilla vuelve a estar pendiente de revisión.', 'Planilla actualizada');
      }
    } catch (err) {
      setError(err.message);
      await modal.error(err.message, 'No se pudo guardar');
    } finally {
      setEnviando(false);
    }
  }

  if (!datos) {
    return (
      <div className="publico-page">
        <BotonRegresar />
        <div className="publico-card">
          <h1>Consultar inscripción</h1>
          <p className="login-sub">Ingresa el código de 7 caracteres que recibiste al inscribirte.</p>
          <form onSubmit={buscar} className="publico-form">
            <label>Código de inscripción
              <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="AB2CD3E" required maxLength={7} />
            </label>
            {errorBusqueda && <div className="login-error">{errorBusqueda}</div>}
            <button type="submit" disabled={buscando}>{buscando ? 'Buscando...' : 'Buscar'}</button>
          </form>
        </div>
        <PieFirma />
      </div>
    );
  }

  const { torneo, equipo: equipoOriginal } = datos;

  return (
    <div className="publico-page">
      <BotonRegresar to={`/inscripcion/${torneo.slug}`} />
      <div className="publico-card">
        {torneo.logo_url && <img src={torneo.logo_url} alt="" className="publico-logo" />}
        <h1>{equipoOriginal.nombre}</h1>
        <p className="login-sub">{torneo.nombre}</p>
        <div className={'publico-regla' + (equipoOriginal.estado !== 'rechazado' ? ' ok' : '')} style={{ marginBottom: 4 }}>
          {ETIQUETAS_ESTADO[equipoOriginal.estado]}
        </div>
        {equipoOriginal.estado === 'rechazado' && equipoOriginal.motivo_rechazo && (
          <p className="admin-empty" style={{ marginBottom: 16 }}>{equipoOriginal.motivo_rechazo}</p>
        )}

        {guardado && (
          <p className={'publico-regla' + (equipoOriginal.estado === 'rechazado' ? '' : ' ok')}>
            {equipoOriginal.estado === 'rechazado'
              ? 'Guardamos los cambios, pero todavía no cumple las condiciones — mira el motivo arriba.'
              : 'Cambios guardados. Quedó de nuevo pendiente de revisión.'}
          </p>
        )}

        {datos.editable ? (
          <FormularioInscripcion
            torneo={torneo}
            slug={torneo.slug}
            equipoIdExcluir={equipoOriginal.id}
            equipo={equipo}
            setEquipo={setEquipo}
            jugadores={jugadores}
            setJugadores={setJugadores}
            onSubmit={onSubmit}
            enviando={enviando}
            error={error}
            textoBoton="Guardar cambios"
          />
        ) : (
          <p className="admin-empty">
            {equipoOriginal.estado === 'aprobado'
              ? 'Tu equipo ya fue aprobado, por eso no se puede editar.'
              : 'Las inscripciones para este campeonato ya no están abiertas.'}
          </p>
        )}
        <OrganizaInfo torneo={torneo} />
      </div>
      <PieFirma />
    </div>
  );
}

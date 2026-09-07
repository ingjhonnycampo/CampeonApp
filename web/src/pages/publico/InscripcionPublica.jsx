import { useEffect, useState } from 'react';
import { nombreModalidad } from '../../lib/modalidad';
import { Link, useParams } from 'react-router-dom';
import { apiPublico } from '../../lib/api';
import { useModal } from '../../context/ModalContext';
import FormularioInscripcion, { jugadorVacio } from '../../components/FormularioInscripcion';
import PieFirma from '../../components/PieFirma';
import CargaJugador from '../../components/CargaJugador';
import OrganizaInfo from '../../components/OrganizaInfo';
import EstadoCampeonato from '../../components/EstadoCampeonato';
import BotonRegresar from '../../components/BotonRegresar';

export default function InscripcionPublica() {
  const { slug } = useParams();
  const modal = useModal();
  const [torneo, setTorneo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  const [equipo, setEquipo] = useState({ nombre: '', delegado: '', delegado_telefono: '', escudo_url: '' });
  const [jugadores, setJugadores] = useState([jugadorVacio()]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null);

  useEffect(() => {
    const inicio = Date.now();
    apiPublico('/torneos/' + slug)
      .then(setTorneo)
      .catch((err) => setErrorCarga(err.message))
      .finally(() => {
        const espera = Math.max(0, 3000 - (Date.now() - inicio));
        setTimeout(() => setCargando(false), espera);
      });
  }, [slug]);

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
      const data = await apiPublico(`/torneos/${slug}/inscripcion`, {
        method: 'POST',
        body: JSON.stringify({ equipo, jugadores })
      });
      setExito(data);
    } catch (err) {
      setError(err.message);
      await modal.error(err.message, 'No se pudo enviar la inscripción');
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <CargaJugador texto="Cargando inscripción..." />;

  if (errorCarga) {
    return (
      <div className="publico-page">
        <BotonRegresar />
        <div className="publico-card"><p className="login-error">{errorCarga}</p></div>
      </div>
    );
  }

  if (exito) {
    const rechazada = exito.equipo.estado === 'rechazado';
    return (
      <div className="publico-page">
        <BotonRegresar />
        <div className="publico-card publico-exito">
          {torneo.logo_url && <img src={torneo.logo_url} alt="" className="publico-logo" />}
          <h1>{rechazada ? 'Inscripción guardada, con un problema' : '¡Inscripción recibida!'}</h1>
          <p>El equipo <strong>{exito.equipo.nombre}</strong> quedó guardado en <strong>{torneo.nombre}</strong>.</p>

          {rechazada && (
            <p className="publico-regla" style={{ textAlign: 'left' }}>{exito.equipo.motivo_rechazo}</p>
          )}

          <div className="publico-codigo">
            <span>Guarda este código para {rechazada ? 'corregir y reenviar' : 'consultar o editar'} tu inscripción</span>
            <strong>{exito.equipo.codigo_acceso}</strong>
          </div>

          {rechazada ? (
            <p className="admin-empty">Ajusta lo que haga falta desde "Mi inscripción" con este código — no hace falta cargar todo de nuevo.</p>
          ) : (
            <p className="admin-empty">Un administrador va a revisar la planilla antes de confirmar el cupo. Te contactaremos al número de contacto que dejaste.</p>
          )}
          <OrganizaInfo torneo={torneo} />
        </div>
        <PieFirma />
      </div>
    );
  }

  if (torneo.estado_inscripciones !== 'abierta') {
    const mensaje = torneo.estado_inscripciones === 'no_abierta'
      ? `Las inscripciones abren el ${new Date(torneo.inscripciones_desde).toLocaleDateString('es-CO')}.`
      : 'Las inscripciones para este campeonato ya cerraron.';
    return (
      <div className="publico-page">
        <BotonRegresar />
        <div className="publico-card">
          {torneo.logo_url && <img src={torneo.logo_url} alt="" className="publico-logo" />}
          <h1>{torneo.nombre}</h1>
          <EstadoCampeonato estado={torneo.estado_campeonato} />
          <p>{mensaje}</p>
          <Link to="/mi-inscripcion" className="publico-link">¿Ya te inscribiste? Consulta tu inscripción</Link>
          <OrganizaInfo torneo={torneo} />
        </div>
        <PieFirma />
      </div>
    );
  }

  return (
    <div className="publico-page">
      <BotonRegresar />
      <div className="publico-card">
        {torneo.logo_url && <img src={torneo.logo_url} alt="" className="publico-logo" />}
        <span className="login-eyebrow">{nombreModalidad(torneo.modalidad)}</span>
        <h1>{torneo.nombre}</h1>
        <EstadoCampeonato estado={torneo.estado_campeonato} />
        <p className="login-sub">Inscripción de equipo. Cierra el {new Date(torneo.inscripciones_hasta).toLocaleDateString('es-CO')}.</p>

        <FormularioInscripcion
          torneo={torneo}
          slug={slug}
          equipo={equipo}
          setEquipo={setEquipo}
          jugadores={jugadores}
          setJugadores={setJugadores}
          onSubmit={onSubmit}
          enviando={enviando}
          error={error}
          textoBoton="Enviar inscripción"
        />

        <Link to="/mi-inscripcion" className="publico-link">¿Ya te inscribiste? Consulta o edita tu inscripción</Link>
        <OrganizaInfo torneo={torneo} />
      </div>
      <PieFirma />
    </div>
  );
}

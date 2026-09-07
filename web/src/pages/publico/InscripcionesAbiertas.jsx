import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { nombreModalidad } from '../../lib/modalidad';
import CargaJugador from '../../components/CargaJugador';
import PieFirma from '../../components/PieFirma';

export default function InscripcionesAbiertas() {
  const [torneos, setTorneos] = useState(null);

  useEffect(() => {
    api('/publico/torneos-inscripciones-abiertas').then(setTorneos);
  }, []);

  if (!torneos) return <CargaJugador texto="Buscando campeonatos..." />;

  return (
    <div className="publico-partido-page">
      <Link to="/" className="publico-en-vivo-volver">← Volver</Link>
      <div className="publico-en-vivo-cabecera">
        <h1>Inscripciones abiertas</h1>
        <span className="publico-en-vivo-modalidad">Elige el campeonato en el que quieres inscribir tu equipo</span>
      </div>

      {torneos.length === 0 && (
        <p className="admin-empty" style={{ textAlign: 'center' }}>
          No hay ningún campeonato con inscripciones abiertas en este momento. Vuelve a intentarlo más adelante.
        </p>
      )}

      <div className="bienvenida-opciones bienvenida-opciones--inscripciones">
        {torneos.map((t) => (
          <Link key={t.id} to={`/inscripcion/${t.slug}`} className="bienvenida-opcion bienvenida-opcion--inscribir">
            {t.logo_url
              ? <img src={t.logo_url} alt="" className="bienvenida-opcion-logo" />
              : <span className="bienvenida-opcion-icono">🏆</span>}
            <strong>{t.nombre}</strong>
            <p>
              {nombreModalidad(t.modalidad)}
              {t.inscripciones_hasta && ` · Cierra el ${new Date(t.inscripciones_hasta).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`}
            </p>
          </Link>
        ))}
      </div>

      <PieFirma />
    </div>
  );
}

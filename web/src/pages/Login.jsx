import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PieFirma from '../components/PieFirma';
import CargaJugador from '../components/CargaJugador';
import CampoContrasena from '../components/CampoContrasena';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [entrando, setEntrando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    const inicio = Date.now();
    try {
      const usuario = await login(email, password);
      setEntrando(true);
      const destino = { admin: '/admin', arbitro: '/arbitro', delegado: '/delegado' }[usuario.rol] || '/';
      const espera = Math.max(0, 3000 - (Date.now() - inicio));
      setTimeout(() => navigate(destino, { replace: true }), espera);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  if (entrando) return <CargaJugador texto="Ingresando..." />;

  return (
    <div className="login-page">
      <div>
        <Link to="/" className="publico-en-vivo-volver">← Inicio</Link>
        <div className="login-card">
          <img src="/logo.png" alt="CampeonApp" className="login-logo" />
          <span className="login-eyebrow">CampeonApp</span>
          <h1>Iniciar sesión</h1>
          <p className="login-sub">Acceso para administradores, árbitros y delegados de equipo.</p>

          <form onSubmit={onSubmit}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label>
              Contraseña
              <CampoContrasena value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" disabled={enviando}>
              {enviando ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
        <PieFirma />
      </div>
    </div>
  );
}

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const inicio = Date.now();
    api('/auth/yo')
      .then(setUsuario)
      .catch(() => setUsuario(null))
      .finally(() => {
        const espera = Math.max(0, 3000 - (Date.now() - inicio));
        setTimeout(() => setCargando(false), espera);
      });
  }, []);

  async function login(email, password) {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setUsuario(data);
    return data;
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

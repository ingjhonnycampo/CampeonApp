import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import CampoContrasena from '../../components/CampoContrasena';

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'organizador', label: 'Organizador' },
  { value: 'arbitro', label: 'Árbitro / anotador' }
];

const FORM_VACIO = { nombre: '', email: '', password: '', rol: 'arbitro', torneo_ids: [] };

export default function SeccionUsuarios() {
  const { usuario: yo } = useAuth();
  const modal = useModal();
  const [usuarios, setUsuarios] = useState([]);
  const [torneos, setTorneos] = useState([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { cargar(); api('/torneos').then(setTorneos); }, []);

  async function cargar() {
    setUsuarios(await api('/usuarios'));
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setError('');
  }

  function editar(u) {
    setEditandoId(u.id);
    setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol, torneo_ids: (u.torneos || []).map((t) => t.id) });
    setError('');
  }

  function alternarTorneo(id) {
    setForm((f) => ({
      ...f,
      torneo_ids: f.torneo_ids.includes(id) ? f.torneo_ids.filter((x) => x !== id) : [...f.torneo_ids, id]
    }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      if (editandoId) {
        const payload = { nombre: form.nombre, email: form.email, rol: form.rol, torneo_ids: form.torneo_ids };
        if (form.password) payload.password = form.password;
        await api(`/usuarios/${editandoId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        await modal.exito('Los datos del usuario se guardaron correctamente.');
      } else {
        await api('/usuarios', { method: 'POST', body: JSON.stringify(form) });
        await modal.exito('El usuario se creó correctamente.');
      }
      await cargar();
      cancelarEdicion();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function eliminar(u) {
    const confirmado = await modal.confirmar({
      titulo: '¿Eliminar este usuario?',
      mensaje: `${u.nombre} (${u.email}) perderá el acceso a la plataforma.`,
      textoAceptar: 'Eliminar',
      peligro: true
    });
    if (!confirmado) return;

    try {
      await api(`/usuarios/${u.id}`, { method: 'DELETE' });
      await cargar();
      await modal.exito('El usuario fue eliminado.');
    } catch (err) {
      await modal.error(err.message, 'No se pudo eliminar');
    }
  }

  return (
    <section className="admin-card">
      <h2>Usuarios</h2>
      <p className="admin-empty">Cuentas de administradores y árbitros. Los delegados no necesitan cuenta: usan el código de acceso de su equipo.</p>

      <div className="admin-list admin-list--alta">
        {usuarios.length === 0 && <p className="admin-empty">Todavía no hay usuarios.</p>}
        {usuarios.map((u) => (
          <div key={u.id} className="admin-item admin-item--estatico admin-item--usuario">
            <span>
              <strong>{u.nombre}</strong>
              <small>{u.email}</small>
              {['arbitro', 'organizador'].includes(u.rol) && (
                <small>
                  {u.torneos?.length ? `Asignado a: ${u.torneos.map((t) => t.nombre).join(', ')}` : 'Sin campeonatos asignados'}
                </small>
              )}
            </span>
            <span className={'admin-estado admin-estado--' + (u.rol === 'admin' ? 'aprobado' : 'pendiente')}>
              {ROLES.find((r) => r.value === u.rol)?.label || u.rol}
            </span>
            <div className="admin-equipo-acciones">
              <button type="button" className="admin-btn-editar" onClick={() => editar(u)}>Editar</button>
              {u.id !== yo.id && (
                <button type="button" className="admin-btn-mal" onClick={() => eliminar(u)}>Eliminar</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="admin-form">
        {editandoId && <p className="admin-empty">Editando "{form.nombre}" — <button type="button" className="publico-quitar" onClick={cancelarEdicion}>cancelar</button></p>}
        <label>Nombre
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
        </label>
        <label>Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </label>
        <label>{editandoId ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña'}
          <CampoContrasena value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editandoId} minLength={6} />
        </label>
        <label>Rol
          <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>

        {['arbitro', 'organizador'].includes(form.rol) && (
          <div className="admin-reglas">
            <span className="subida-imagen-label">
              {form.rol === 'organizador'
                ? 'Campeonatos sobre los que tiene control total (como si fuera administrador de esos, solamente)'
                : 'Campeonatos a los que tiene acceso'}
            </span>
            {torneos.length === 0 && <p className="admin-empty">Todavía no hay campeonatos creados.</p>}
            {torneos.map((t) => (
              <label key={t.id} className="admin-checkbox">
                <input type="checkbox" checked={form.torneo_ids.includes(t.id)} onChange={() => alternarTorneo(t.id)} />
                {t.nombre}
              </label>
            ))}
          </div>
        )}

        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Crear usuario'}
        </button>
      </form>
    </section>
  );
}

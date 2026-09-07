import PieFirma from '../../components/PieFirma';
import PanelHeader from '../../components/PanelHeader';
import SeccionUsuarios from './SeccionUsuarios';

export default function AdminUsuarios() {
  return (
    <div className="admin-panel">
      <PanelHeader titulo="Usuarios" volverA="/admin" />

      <div className="admin-grid admin-grid--uno">
        <SeccionUsuarios />
      </div>

      <PieFirma />
    </div>
  );
}

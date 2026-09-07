// Reglas de sanciones por tarjeta. Los valores por defecto (usados si el torneo no
// configuró nada en torneo_reglas_sancion) son:
//
// - Amarilla o azul: el jugador no puede jugar el partido siguiente HASTA que el
//   organizador/admin lo habilite a mano (pagó la multa). Sin mínimo obligatorio:
//   si se habilita antes de ese partido, ni siquiera llega a perdérselo.
// - Doble amarilla (la roja que el sistema agrega solo cuando es la 2da amarilla
//   del jugador en el mismo partido): 1 partido de suspensión OBLIGATORIO — pagar
//   no lo salta — y recién para el partido siguiente A ESE necesita habilitación.
// - Roja directa (cualquier otra roja): 2 partidos obligatorios, luego habilitación
//   para el que sigue.
//
// Cada torneo puede configurar estos valores a su manera desde su creación (ver
// torneo_reglas_sancion) — acá solo se usan como default para el que no configuró.
//
// Todo esto se calcula en vivo a partir de partido_tarjetas + sancion_habilitaciones
// — no se guarda ningún contador aparte que se pueda desincronizar.
const DEFAULTS = {
  amarilla: { fechas: 0, multa: 0 },
  azul: { fechas: 0, multa: 0 },
  doble_amarilla: { fechas: 1, multa: 0 },
  roja_directa: { fechas: 2, multa: 0 }
};

const TIPOS_SANCION = Object.keys(DEFAULTS);

async function obtenerReglas(pool, torneoId) {
  const { rows } = await pool.query(
    'SELECT tipo_sancion, fechas_obligatorias, multa FROM torneo_reglas_sancion WHERE torneo_id = $1',
    [torneoId]
  );
  const reglas = { ...DEFAULTS };
  for (const r of rows) reglas[r.tipo_sancion] = { fechas: r.fechas_obligatorias, multa: Number(r.multa) };
  return reglas;
}

// Reemplaza TODA la configuración de sanciones de un torneo (se llama al crearlo o
// editarlo). `filas` es un arreglo de { tipo_sancion, fechas_obligatorias, multa };
// los tipos que no vengan simplemente usan el default.
async function guardarReglas(pool, torneoId, filas) {
  await pool.query('DELETE FROM torneo_reglas_sancion WHERE torneo_id = $1', [torneoId]);
  for (const f of filas || []) {
    if (!TIPOS_SANCION.includes(f.tipo_sancion)) continue;
    await pool.query(
      `INSERT INTO torneo_reglas_sancion (torneo_id, tipo_sancion, fechas_obligatorias, multa) VALUES ($1, $2, $3, $4)`,
      [torneoId, f.tipo_sancion, Number(f.fechas_obligatorias) || 0, Number(f.multa) || 0]
    );
  }
}

// Partidos de un equipo dentro del torneo, en el orden real en que se juegan
// (fixture principal primero, luego cada fase en el orden en que se configuró,
// y dentro de cada una por jornada) — el mismo orden que usa el resto de la app
// para "la fecha siguiente" de un equipo.
async function partidosDeEquipoOrdenados(pool, torneoId, equipoId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.jornada, p.fase_id, p.estado, COALESCE(f.orden, 0) AS fase_orden
     FROM partidos p
     LEFT JOIN fases f ON f.id = p.fase_id
     WHERE p.torneo_id = $1 AND (p.equipo_local_id = $2 OR p.equipo_visitante_id = $2)
       AND p.equipo_local_id IS NOT NULL AND p.equipo_visitante_id IS NOT NULL
     ORDER BY fase_orden, p.jornada, p.id`,
    [torneoId, equipoId]
  );
  return rows;
}

// Todas las sanciones activas del torneo: las que todavía le impiden jugar algún
// partido pendiente a alguien. Una vez un jugador cumple lo obligatorio y queda
// habilitado, deja de aparecer acá — no hay que borrar nada a mano.
async function calcularSanciones(pool, torneoId) {
  const { rows: tarjetas } = await pool.query(
    `SELECT t.id, t.partido_id, t.jugador_id, t.equipo_id, t.tipo, t.doble_amarilla,
            j.nombre AS jugador_nombre, e.nombre AS equipo_nombre
     FROM partido_tarjetas t
     JOIN partidos p ON p.id = t.partido_id
     JOIN jugadores j ON j.id = t.jugador_id
     JOIN equipos e ON e.id = t.equipo_id
     WHERE p.torneo_id = $1 AND t.tipo IN ('amarilla', 'roja', 'azul')
     ORDER BY t.id`,
    [torneoId]
  );
  if (tarjetas.length === 0) return [];

  // Si el jugador tiene 2 amarillas en el mismo partido, esas dos ya quedan
  // cubiertas por la roja automática — no generan sanción aparte cada una.
  const amarillasPorPartidoJugador = new Map();
  for (const t of tarjetas) {
    if (t.tipo !== 'amarilla') continue;
    const clave = `${t.partido_id}-${t.jugador_id}`;
    amarillasPorPartidoJugador.set(clave, (amarillasPorPartidoJugador.get(clave) || 0) + 1);
  }

  const sancionables = [];
  for (const t of tarjetas) {
    if (t.tipo === 'amarilla') {
      const clave = `${t.partido_id}-${t.jugador_id}`;
      if (amarillasPorPartidoJugador.get(clave) >= 2) continue;
      sancionables.push({ ...t, tipoSancion: 'amarilla' });
    } else if (t.tipo === 'azul') {
      sancionables.push({ ...t, tipoSancion: 'azul' });
    } else if (t.tipo === 'roja') {
      sancionables.push({ ...t, tipoSancion: t.doble_amarilla ? 'doble_amarilla' : 'roja_directa' });
    }
  }
  if (sancionables.length === 0) return [];

  const reglas = await obtenerReglas(pool, torneoId);

  const { rows: habilitacionesRows } = await pool.query(
    `SELECT tarjeta_id FROM sancion_habilitaciones WHERE tarjeta_id = ANY($1::int[])`,
    [sancionables.map((s) => s.id)]
  );
  const habilitadas = new Set(habilitacionesRows.map((h) => h.tarjeta_id));

  const partidosPorEquipo = new Map();
  for (const equipoId of new Set(sancionables.map((s) => s.equipo_id))) {
    partidosPorEquipo.set(equipoId, await partidosDeEquipoOrdenados(pool, torneoId, equipoId));
  }

  const activas = [];
  for (const s of sancionables) {
    const { fechas: mandatorios, multa } = reglas[s.tipoSancion];
    const partidos = partidosPorEquipo.get(s.equipo_id) || [];
    const idxOrigen = partidos.findIndex((p) => p.id === s.partido_id);
    const posteriores = idxOrigen === -1 ? [] : partidos.slice(idxOrigen + 1);
    const habilitado = habilitadas.has(s.id);

    // Bloqueados: los primeros "mandatorios" partidos SIEMPRE (pagar no los salta),
    // y de ahí en adelante todos, mientras no esté habilitado.
    const bloqueados = posteriores.filter((p, i) => i < mandatorios || !habilitado);
    const pendientes = bloqueados.filter((p) => p.estado !== 'jugado');
    if (pendientes.length === 0) continue; // ya cumplió todo lo que le tocaba

    const mandatoriosPendientes = posteriores.slice(0, mandatorios).filter((p) => p.estado !== 'jugado').length;

    activas.push({
      tarjetaId: s.id,
      jugadorId: s.jugador_id,
      jugadorNombre: s.jugador_nombre,
      equipoId: s.equipo_id,
      equipoNombre: s.equipo_nombre,
      tipoSancion: s.tipoSancion,
      partidoOrigenId: s.partido_id,
      partidosObligatorios: mandatorios,
      partidosObligatoriosPendientes: mandatoriosPendientes,
      // Mientras queden partidos obligatorios por cumplir, no tiene caso habilitar
      // todavía (no lo va a saltar). Ya cumplidos esos, si no está habilitado, cada
      // partido pendiente queda bloqueado hasta que se registre el pago.
      requierePago: mandatoriosPendientes === 0 && !habilitado,
      habilitado,
      multa,
      // Para la vista (pública y de admin): SOLO la fecha que sigue, no todas las
      // que quedan bloqueadas de por medio — apenas esa se juega, esto se recalcula
      // solo y pasa a mostrar la que sigue después.
      proximoPartidoBloqueadoId: pendientes[0].id,
      proximaFechaBloqueada: pendientes[0].jornada,
      // Para el bloqueo real de alineación (todas las que apliquen, no solo la próxima).
      partidosBloqueadosIds: pendientes.map((p) => p.id)
    });
  }
  return activas;
}

// Ids de jugadores que NO pueden estar en la alineación de este partido puntual
// (ni titulares ni suplentes), para ese equipo — por tarjetas O por estar
// expulsados definitivamente del campeonato.
async function jugadoresSuspendidosParaPartido(pool, torneoId, partidoId) {
  const activas = await calcularSanciones(pool, torneoId);
  const ids = new Set();
  for (const s of activas) {
    if (s.partidosBloqueadosIds.includes(Number(partidoId))) ids.add(s.jugadorId);
  }
  const disciplina = await calcularDisciplinaJugador(pool, torneoId);
  for (const d of disciplina) {
    if (d.partidosBloqueadosIds.includes(Number(partidoId))) ids.add(d.jugadorId);
  }
  const expulsados = await jugadoresExpulsadosDelTorneo(pool, torneoId);
  for (const id of expulsados) ids.add(id);
  return ids;
}

// Expulsión DEFINITIVA de un jugador (falta disciplinaria grave: no alcanza con
// una tarjeta). El jugador queda vetado el resto del campeonato, y el equipo
// completo queda bloqueado para jugar hasta que se pague la multa.
async function expulsarJugador(pool, { torneoId, jugadorId, motivo, multa, creadoPor }) {
  const { rows: jugadorRows } = await pool.query('SELECT equipo_id FROM jugadores WHERE id = $1', [jugadorId]);
  const jugador = jugadorRows[0];
  if (!jugador) throw new Error('Jugador no encontrado');

  const { rows } = await pool.query(
    `INSERT INTO jugador_expulsiones (torneo_id, jugador_id, equipo_id, motivo, multa, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [torneoId, jugadorId, jugador.equipo_id, motivo, multa || 0, creadoPor]
  );
  return rows[0];
}

async function marcarMultaExpulsionPagada(pool, expulsionId, usuarioId) {
  await pool.query(
    `UPDATE jugador_expulsiones SET pagado = true, pagado_por = $1, pagado_en = now() WHERE id = $2`,
    [usuarioId, expulsionId]
  );
}

// Todas las expulsiones del torneo, con el nombre del jugador/equipo, para
// mostrar en Sanciones (pública y de admin).
async function calcularExpulsiones(pool, torneoId) {
  const { rows } = await pool.query(
    `SELECT ex.id, ex.jugador_id, ex.equipo_id, ex.motivo, ex.multa, ex.pagado, ex.creado_en,
            j.nombre AS jugador_nombre, e.nombre AS equipo_nombre
     FROM jugador_expulsiones ex
     JOIN jugadores j ON j.id = ex.jugador_id
     JOIN equipos e ON e.id = ex.equipo_id
     WHERE ex.torneo_id = $1
     ORDER BY ex.creado_en DESC`,
    [torneoId]
  );
  return rows.map((r) => ({
    id: r.id, jugadorId: r.jugador_id, equipoId: r.equipo_id, motivo: r.motivo,
    multa: Number(r.multa), pagado: r.pagado, creadoEn: r.creado_en,
    jugadorNombre: r.jugador_nombre, equipoNombre: r.equipo_nombre
  }));
}

// Ids de jugadores expulsados definitivamente (para todo el resto del torneo).
async function jugadoresExpulsadosDelTorneo(pool, torneoId) {
  const { rows } = await pool.query('SELECT jugador_id FROM jugador_expulsiones WHERE torneo_id = $1', [torneoId]);
  return new Set(rows.map((r) => r.jugador_id));
}

// Ids de equipos con una multa sin pagar (por expulsión de un jugador, o por
// disciplina de oficio a un jugador o al equipo) — no pueden jugar NINGÚN
// partido más (ni siquiera armar alineación) mientras eso siga así.
async function equiposConMultaPendiente(pool, torneoId) {
  const { rows } = await pool.query(
    `SELECT equipo_id FROM jugador_expulsiones WHERE torneo_id = $1 AND pagado = false
     UNION
     SELECT equipo_id FROM disciplina_jugador WHERE torneo_id = $1 AND pagado = false AND multa > 0
     UNION
     SELECT equipo_id FROM disciplina_equipo WHERE torneo_id = $1 AND pagado = false`,
    [torneoId]
  );
  return new Set(rows.map((r) => r.equipo_id));
}

// ---------------------------------------------------------------------------
// DISCIPLINA: sanciones administrativas "de oficio" por conductas EXTRADEPORTIVAS
// (no vistas en el partido) — separadas por completo de las sanciones por
// tarjeta de arriba, que no se tocan.
//
// Jugador: motivo + puede llevar multa y/o suspensión de N fechas. La
// suspensión SOLO bloquea al jugador (no puede ser convocado) en las próximas
// N fechas pendientes de su equipo desde que se crea la sanción — el equipo
// sigue jugando esos partidos con normalidad, NUNCA por walkover. Si la falta
// amerita expulsión definitiva del campeonato, se usa expulsarJugador (ya
// existente arriba), no esta tabla.
//
// Equipo: por ahora solo sanción económica (sin suspensión por fechas). La
// expulsión de oficio de un equipo se hace con aplicarBajaEquipo (server/bajas.js
// — la misma función que usa el botón "Descalificar" y la regla automática de
// 2 inasistencias), así que no hace falta duplicarla acá.
// ---------------------------------------------------------------------------

async function crearDisciplinaJugador(pool, { torneoId, jugadorId, motivo, fechas, multa, creadoPor }) {
  const { rows: jugadorRows } = await pool.query('SELECT equipo_id FROM jugadores WHERE id = $1', [jugadorId]);
  const jugador = jugadorRows[0];
  if (!jugador) throw new Error('Jugador no encontrado');

  const { rows } = await pool.query(
    `INSERT INTO disciplina_jugador (torneo_id, jugador_id, equipo_id, motivo, fechas, multa, pagado, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [torneoId, jugadorId, jugador.equipo_id, motivo, fechas || 0, multa || 0, !(multa > 0), creadoPor]
  );
  return rows[0];
}

async function marcarMultaDisciplinaJugadorPagada(pool, id, usuarioId) {
  await pool.query(
    `UPDATE disciplina_jugador SET pagado = true, pagado_por = $1, pagado_en = now() WHERE id = $2`,
    [usuarioId, id]
  );
}

// Sanciones de disciplina a jugadores del torneo, con los partidos que le
// bloquean HOY (se recalcula solo a medida que se juegan las fechas, igual que
// las sanciones por tarjeta).
async function calcularDisciplinaJugador(pool, torneoId) {
  const { rows } = await pool.query(
    `SELECT d.*, j.nombre AS jugador_nombre, e.nombre AS equipo_nombre
     FROM disciplina_jugador d
     JOIN jugadores j ON j.id = d.jugador_id
     JOIN equipos e ON e.id = d.equipo_id
     WHERE d.torneo_id = $1
     ORDER BY d.creado_en DESC`,
    [torneoId]
  );

  const partidosPorEquipo = new Map();
  const resultado = [];
  for (const d of rows) {
    let partidosBloqueadosIds = [];
    let proximaFechaBloqueada = null;
    if (d.fechas > 0) {
      if (!partidosPorEquipo.has(d.equipo_id)) {
        partidosPorEquipo.set(d.equipo_id, await partidosDeEquipoOrdenados(pool, torneoId, d.equipo_id));
      }
      const pendientes = partidosPorEquipo.get(d.equipo_id).filter((p) => p.estado !== 'jugado');
      const bloqueados = pendientes.slice(0, d.fechas);
      partidosBloqueadosIds = bloqueados.map((p) => p.id);
      proximaFechaBloqueada = bloqueados[0]?.jornada ?? null;
    }
    resultado.push({
      id: d.id,
      jugadorId: d.jugador_id,
      jugadorNombre: d.jugador_nombre,
      equipoId: d.equipo_id,
      equipoNombre: d.equipo_nombre,
      motivo: d.motivo,
      fechas: d.fechas,
      multa: Number(d.multa),
      pagado: d.pagado,
      creadoEn: d.creado_en,
      partidosBloqueadosIds,
      proximaFechaBloqueada,
      activa: partidosBloqueadosIds.length > 0 || (Number(d.multa) > 0 && !d.pagado)
    });
  }
  return resultado;
}

async function crearDisciplinaEquipo(pool, { torneoId, equipoId, motivo, multa, creadoPor }) {
  const { rows } = await pool.query(
    `INSERT INTO disciplina_equipo (torneo_id, equipo_id, motivo, multa, creado_por)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [torneoId, equipoId, motivo, multa || 0, creadoPor]
  );
  return rows[0];
}

async function marcarMultaDisciplinaEquipoPagada(pool, id, usuarioId) {
  await pool.query(
    `UPDATE disciplina_equipo SET pagado = true, pagado_por = $1, pagado_en = now() WHERE id = $2`,
    [usuarioId, id]
  );
}

async function calcularDisciplinaEquipo(pool, torneoId) {
  const { rows } = await pool.query(
    `SELECT d.*, e.nombre AS equipo_nombre
     FROM disciplina_equipo d
     JOIN equipos e ON e.id = d.equipo_id
     WHERE d.torneo_id = $1
     ORDER BY d.creado_en DESC`,
    [torneoId]
  );
  return rows.map((d) => ({
    id: d.id,
    equipoId: d.equipo_id,
    equipoNombre: d.equipo_nombre,
    motivo: d.motivo,
    multa: Number(d.multa),
    pagado: d.pagado,
    creadoEn: d.creado_en
  }));
}

module.exports = {
  calcularSanciones, jugadoresSuspendidosParaPartido, obtenerReglas, guardarReglas, TIPOS_SANCION, DEFAULTS,
  expulsarJugador, marcarMultaExpulsionPagada, calcularExpulsiones, jugadoresExpulsadosDelTorneo, equiposConMultaPendiente,
  crearDisciplinaJugador, marcarMultaDisciplinaJugadorPagada, calcularDisciplinaJugador,
  crearDisciplinaEquipo, marcarMultaDisciplinaEquipoPagada, calcularDisciplinaEquipo
};

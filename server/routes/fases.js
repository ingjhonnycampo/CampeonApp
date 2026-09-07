const express = require('express');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth, requireAccesoTorneo } = require('../middleware/auth');
const {
  generarRoundRobinConDescansos, emparejarDescansos, calcularPosiciones, obtenerMejoresTerceros, nombreRonda, barajar,
  proyectarPartidosEnCurso, equiposEnVivo
} = require('../fixture');
const { generarEtiquetasRonda1, aplicarOrdenSemillas, obtenerSorteos } = require('../clasificacion');
const { registrar } = require('../bitacora');

const router = express.Router();

async function obtenerTorneoIdDeFase(faseId) {
  const { rows } = await pool.query('SELECT torneo_id FROM fases WHERE id = $1', [faseId]);
  return rows[0]?.torneo_id;
}

async function obtenerTorneoIdDeGrupo(grupoId) {
  const { rows } = await pool.query(
    'SELECT f.torneo_id FROM grupos g JOIN fases f ON f.id = g.fase_id WHERE g.id = $1',
    [grupoId]
  );
  return rows[0]?.torneo_id;
}

// Las fases (grupos + eliminatoria) se crean una sola vez, de forma automática,
// desde POST /torneos/:id/generar-fixture. Este router solo expone lo que se
// necesita DESPUÉS de esa configuración inicial: consultar el estado, asignar
// equipos a los grupos, generar el fixture dentro de cada grupo, y reordenar
// manualmente los cruces de la primera ronda de la eliminatoria antes de jugar.

router.get('/', asyncHandler(async (req, res) => {
  const { torneo_id } = req.query;
  if (!torneo_id) return res.status(400).json({ error: 'torneo_id es obligatorio' });

  const { rows: fases } = await pool.query(
    `SELECT * FROM fases WHERE torneo_id = $1 ORDER BY orden, id`,
    [torneo_id]
  );
  const { rows: grupos } = await pool.query(
    `SELECT g.*, json_agg(json_build_object('id', e.id, 'nombre', e.nombre, 'escudo_url', e.escudo_url))
       FILTER (WHERE e.id IS NOT NULL) AS equipos
     FROM grupos g
     LEFT JOIN grupo_equipos ge ON ge.grupo_id = g.id
     LEFT JOIN equipos e ON e.id = ge.equipo_id
     WHERE g.fase_id = ANY($1::int[])
     GROUP BY g.id
     ORDER BY g.nombre`,
    [fases.map((f) => f.id)]
  );

  res.json(fases.map((f) => ({ ...f, grupos: grupos.filter((g) => g.fase_id === f.id) })));
}));

// Reemplaza por completo los equipos asignados a un grupo.
router.put('/grupos/:grupoId/equipos', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDeGrupo(req.params.grupoId)), asyncHandler(async (req, res) => {
  const { equipo_ids } = req.body;
  if (!Array.isArray(equipo_ids)) return res.status(400).json({ error: 'equipo_ids debe ser un arreglo' });

  await pool.query('DELETE FROM grupo_equipos WHERE grupo_id = $1', [req.params.grupoId]);
  for (const equipoId of equipo_ids) {
    await pool.query('INSERT INTO grupo_equipos (grupo_id, equipo_id) VALUES ($1, $2)', [req.params.grupoId, equipoId]);
  }
  res.json({ ok: true });
}));

router.get('/:id/partidos', asyncHandler(async (req, res) => {
  const { rows: faseRows } = await pool.query('SELECT * FROM fases WHERE id = $1', [req.params.id]);
  const fase = faseRows[0];
  const { rows } = await pool.query(
    `SELECT p.*, t.duracion_tiempo_1, t.duracion_tiempo_2,
            el.nombre AS equipo_local_nombre, el.escudo_url AS equipo_local_escudo,
            ev.nombre AS equipo_visitante_nombre, ev.escudo_url AS equipo_visitante_escudo
     FROM partidos p
     JOIN torneos t ON t.id = p.torneo_id
     LEFT JOIN equipos el ON el.id = p.equipo_local_id
     LEFT JOIN equipos ev ON ev.id = p.equipo_visitante_id
     WHERE p.fase_id = $1
     ORDER BY p.jornada, p.id`,
    [req.params.id]
  );

  if (fase?.tipo === 'eliminacion') {
    const porId = Object.fromEntries(rows.map((p) => [p.id, p]));

    // Nombre de la ronda (Cuartos, Semifinal...) y número de llave dentro de la
    // ronda (se numera aparte cada ronda; el partido por el 3er puesto no lleva).
    // Si la llave es ida y vuelta, la "vuelta" no cuenta aparte: hereda ronda_nombre
    // y llave de su ida (partido_ida_id), y se marca es_vuelta para que la interfaz
    // la muestre como la segunda pierna del mismo cruce.
    const equiposPorJornada = {};
    rows.forEach((p) => {
      if (p.es_tercer_puesto || p.partido_ida_id) return;
      equiposPorJornada[p.jornada] = (equiposPorJornada[p.jornada] || 0) + 1;
    });
    const contadorLlavePorJornada = {};
    rows.forEach((p) => {
      if (p.es_tercer_puesto) { p.ronda_nombre = 'Partido por el tercer puesto'; return; }
      if (p.partido_ida_id) return; // se resuelve despues, heredando de la ida
      contadorLlavePorJornada[p.jornada] = (contadorLlavePorJornada[p.jornada] || 0) + 1;
      p.llave = contadorLlavePorJornada[p.jornada];
      p.ronda_nombre = nombreRonda((equiposPorJornada[p.jornada] || 0) * 2);
    });
    rows.forEach((p) => {
      if (!p.partido_ida_id) return;
      const ida = porId[p.partido_ida_id];
      p.llave = ida?.llave;
      p.ronda_nombre = ida?.ronda_nombre;
      p.es_vuelta = true;
    });

    // Mientras un cupo siga "por definir", arma una etiqueta de qué se espera ahí:
    // en la primera ronda, el puesto de clasificación (ej. "1° Grupo A"); en las
    // rondas siguientes, a qué llave anterior le gana (o le pierde, si es el 3er puesto).
    const etiquetasRonda1 = rows.some((p) => p.jornada === 1 && !p.equipo_local_id)
      ? await generarEtiquetasRonda1(pool, fase)
      : null;

    rows.forEach((p) => {
      if (p.partido_ida_id) return; // las vueltas se resuelven aparte, abajo (heredan de su ida, invertido)
      const esRondaUno = p.jornada === 1;
      if (esRondaUno) {
        if (!p.equipo_local_id) {
          p.pendiente_local = etiquetasRonda1 ? etiquetasRonda1[p.orden_semilla_local] : 'Por sorteo entre clasificados';
        }
        if (!p.equipo_visitante_id) {
          p.pendiente_visitante = etiquetasRonda1 ? etiquetasRonda1[p.orden_semilla_visitante] : 'Por sorteo entre clasificados';
        }
      } else {
        if (!p.equipo_local_id) {
          const origenPartido = p.origen_local_id ? porId[p.origen_local_id] : null;
          p.pendiente_local = origenPartido ? `${p.es_tercer_puesto ? 'Perdedor' : 'Ganador'} Llave ${origenPartido.llave}` : 'Por definir';
        }
        if (!p.equipo_visitante_id) {
          const origenPartido = p.origen_visitante_id ? porId[p.origen_visitante_id] : null;
          p.pendiente_visitante = origenPartido ? `${p.es_tercer_puesto ? 'Perdedor' : 'Ganador'} Llave ${origenPartido.llave}` : 'Por definir';
        }
      }
    });
    rows.forEach((p) => {
      if (!p.partido_ida_id) return;
      const ida = porId[p.partido_ida_id];
      if (!ida) return;
      if (!p.equipo_local_id) p.pendiente_local = ida.pendiente_visitante;
      if (!p.equipo_visitante_id) p.pendiente_visitante = ida.pendiente_local;
    });
  }

  res.json(rows);
}));

// Reordena manualmente los cruces de la primera ronda de una eliminatoria, antes de
// que se haya jugado o cargado resultado en ninguno. Solo permite reacomodar los
// mismos equipos que ya clasificaron entre los mismos partidos, no agregar/quitar.
router.put('/:id/cruces', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDeFase(req.params.id)), asyncHandler(async (req, res) => {
  const { pares } = req.body;
  if (!Array.isArray(pares) || pares.length === 0) {
    return res.status(400).json({ error: 'pares debe ser un arreglo de [equipo_local_id, equipo_visitante_id]' });
  }

  const { rows: faseRows } = await pool.query('SELECT * FROM fases WHERE id = $1', [req.params.id]);
  const fase = faseRows[0];
  if (!fase) return res.status(404).json({ error: 'Fase no encontrada' });
  if (fase.tipo !== 'eliminacion') return res.status(400).json({ error: 'Esta acción solo aplica a fases de eliminatoria' });

  const { rows: partidosRonda1 } = await pool.query(
    'SELECT * FROM partidos WHERE fase_id = $1 AND jornada = 1 AND partido_ida_id IS NULL ORDER BY id',
    [req.params.id]
  );
  if (partidosRonda1.length === 0) return res.status(400).json({ error: 'Esta fase todavía no tiene cruces generados' });
  if (!partidosRonda1[0].equipo_local_id) {
    return res.status(400).json({ error: 'Todavía no se conocen los equipos clasificados a la primera ronda' });
  }
  const { rows: ronda1TodasEstado } = await pool.query('SELECT estado FROM partidos WHERE fase_id = $1 AND jornada = 1', [req.params.id]);
  if (ronda1TodasEstado.some((p) => p.estado === 'jugado')) {
    return res.status(400).json({ error: 'Ya se jugó al menos un partido de la primera ronda, no se puede reordenar' });
  }
  if (pares.length !== partidosRonda1.length) {
    return res.status(400).json({ error: `Debes enviar ${partidosRonda1.length} cruces` });
  }

  const equiposActuales = new Set();
  partidosRonda1.forEach((p) => { equiposActuales.add(p.equipo_local_id); equiposActuales.add(p.equipo_visitante_id); });

  const equiposNuevos = new Set();
  for (const par of pares) {
    if (!Array.isArray(par) || par.length !== 2) return res.status(400).json({ error: 'Cada cruce debe tener 2 equipos' });
    const [a, b] = par;
    if (a === b) return res.status(400).json({ error: 'Un equipo no puede jugar contra sí mismo' });
    if (equiposNuevos.has(a) || equiposNuevos.has(b)) return res.status(400).json({ error: 'Un equipo no puede aparecer en más de un cruce' });
    equiposNuevos.add(a);
    equiposNuevos.add(b);
  }
  if (equiposNuevos.size !== equiposActuales.size || [...equiposNuevos].some((id) => !equiposActuales.has(id))) {
    return res.status(400).json({ error: 'Los cruces deben usar exactamente los mismos equipos clasificados, solo reordenados' });
  }

  for (let i = 0; i < pares.length; i++) {
    await pool.query(
      'UPDATE partidos SET equipo_local_id = $1, equipo_visitante_id = $2 WHERE id = $3',
      [pares[i][0], pares[i][1], partidosRonda1[i].id]
    );
    // Si esta llave se juega ida y vuelta, sincroniza la vuelta invertida.
    await pool.query(
      'UPDATE partidos SET equipo_local_id = $1, equipo_visitante_id = $2 WHERE partido_ida_id = $3',
      [pares[i][1], pares[i][0], partidosRonda1[i].id]
    );
  }

  res.json({ ok: true });
}));

// Reordena los cruces de la primera ronda POR POSICIÓN (ej. "1° Grupo A" vs
// "2° Grupo B"), sin necesitar todavía saber qué equipo real ocupa cada puesto.
// Sirve para evitar de antemano que dos equipos del mismo grupo (o cualquier
// combinación) se crucen apenas empiece la eliminatoria. Funciona en cualquier
// momento antes de que se juegue el primer partido de la ronda — si los equipos
// reales ya se conocen, se reacomodan de inmediato con el nuevo orden.
router.put('/:id/orden-semillas', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDeFase(req.params.id)), asyncHandler(async (req, res) => {
  const { pares } = req.body;
  if (!Array.isArray(pares) || pares.length === 0) {
    return res.status(400).json({ error: 'pares debe ser un arreglo de [semillaLocal, semillaVisitante]' });
  }

  const { rows: faseRows } = await pool.query('SELECT * FROM fases WHERE id = $1', [req.params.id]);
  const fase = faseRows[0];
  if (!fase) return res.status(404).json({ error: 'Fase no encontrada' });
  if (fase.tipo !== 'eliminacion') return res.status(400).json({ error: 'Esta acción solo aplica a fases de eliminatoria' });

  const { rows: ronda1 } = await pool.query('SELECT * FROM partidos WHERE fase_id = $1 AND jornada = 1 AND partido_ida_id IS NULL ORDER BY id', [req.params.id]);
  if (ronda1.length === 0) return res.status(400).json({ error: 'Esta fase todavía no tiene un cuadro generado' });
  const { rows: ronda1TodasEstado } = await pool.query('SELECT estado FROM partidos WHERE fase_id = $1 AND jornada = 1', [req.params.id]);
  if (ronda1TodasEstado.some((p) => p.estado === 'jugado')) {
    return res.status(400).json({ error: 'Ya se jugó al menos un partido de la primera ronda, no se puede reordenar' });
  }
  if (pares.length !== ronda1.length) {
    return res.status(400).json({ error: `Debes enviar ${ronda1.length} cruces` });
  }

  const totalSemillas = ronda1.length * 2;
  const usadas = new Set();
  for (const par of pares) {
    if (!Array.isArray(par) || par.length !== 2) return res.status(400).json({ error: 'Cada cruce debe tener 2 posiciones' });
    const [a, b] = par;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a >= totalSemillas || b < 0 || b >= totalSemillas) {
      return res.status(400).json({ error: 'Posición inválida' });
    }
    if (a === b) return res.status(400).json({ error: 'Una posición no puede jugar contra sí misma' });
    if (usadas.has(a) || usadas.has(b)) return res.status(400).json({ error: 'Una posición no puede aparecer en más de un cruce' });
    usadas.add(a);
    usadas.add(b);
  }

  // Si ya se conocen los equipos reales, reconstruye "qué equipo ocupa cada
  // posición" a partir del cuadro actual (no se vuelve a sortear ni a recalcular),
  // para poder reacomodarlos de inmediato con el nuevo orden.
  let clasificadosActuales = null;
  if (ronda1[0].equipo_local_id) {
    clasificadosActuales = [];
    ronda1.forEach((p) => {
      clasificadosActuales[p.orden_semilla_local] = p.equipo_local_id;
      clasificadosActuales[p.orden_semilla_visitante] = p.equipo_visitante_id;
    });
  }

  for (let i = 0; i < pares.length; i++) {
    await pool.query(
      'UPDATE partidos SET orden_semilla_local = $1, orden_semilla_visitante = $2 WHERE id = $3',
      [pares[i][0], pares[i][1], ronda1[i].id]
    );
  }

  if (clasificadosActuales) {
    const { rows: ronda1Actualizada } = await pool.query('SELECT * FROM partidos WHERE fase_id = $1 AND jornada = 1 AND partido_ida_id IS NULL ORDER BY id', [req.params.id]);
    await aplicarOrdenSemillas(pool, fase, ronda1Actualizada, clasificadosActuales);
  }

  res.json({ ok: true });
}));

// Posiciones de la fase, agrupadas por grupo (si la fase es de tipo 'grupos').
router.get('/:id/posiciones', asyncHandler(async (req, res) => {
  const { en_vivo } = req.query;
  const { rows: faseRows } = await pool.query('SELECT * FROM fases WHERE id = $1', [req.params.id]);
  const fase = faseRows[0];
  if (!fase) return res.status(404).json({ error: 'Fase no encontrada' });

  const { rows: partidos } = await pool.query('SELECT * FROM partidos WHERE fase_id = $1', [req.params.id]);

  if (fase.tipo === 'grupos') {
    const { rows: grupos } = await pool.query('SELECT * FROM grupos WHERE fase_id = $1 ORDER BY nombre', [req.params.id]);
    const tablas = [];
    for (const grupo of grupos) {
      const { rows: equipos } = await pool.query(
        `SELECT e.id, e.nombre, e.escudo_url, e.estado_torneo, e.baja_motivo FROM grupo_equipos ge JOIN equipos e ON e.id = ge.equipo_id WHERE ge.grupo_id = $1`,
        [grupo.id]
      );
      // El partido intergrupo no tiene grupo_id (juega gente de dos grupos distintos),
      // pero sí cuenta para la tabla de cada uno — calcularPosiciones ya sabe sumarlo
      // solo del lado del equipo que realmente pertenece a este grupo.
      const partidosGrupo = partidos.filter((p) => p.grupo_id === grupo.id || p.es_intergrupo);
      const sorteos = await obtenerSorteos(pool, fase.torneo_id, grupo.id);
      const tabla = calcularPosiciones(equipos, en_vivo ? proyectarPartidosEnCurso(partidosGrupo) : partidosGrupo, sorteos);
      if (en_vivo) {
        const enVivoIds = equiposEnVivo(partidosGrupo);
        tabla.forEach((f) => { f.en_vivo = enVivoIds.has(f.equipo_id); });
      }
      tablas.push({ grupo_id: grupo.id, grupo_nombre: grupo.nombre, tabla });
    }

    if (fase.clasifican) {
      tablas.forEach((g) => g.tabla.forEach((f, i) => { f.clasifica = i < fase.clasifican; }));
      if (fase.mejores_terceros > 0) {
        const mejores = obtenerMejoresTerceros(tablas.map((g) => g.tabla), fase.clasifican, fase.mejores_terceros);
        const idsClasificados = new Set(mejores.map((m) => m.equipo_id));
        tablas.forEach((g) => g.tabla.forEach((f) => { if (idsClasificados.has(f.equipo_id)) f.clasifica = true; }));
      }
    }

    return res.json(tablas);
  }

  const { rows: equipos } = await pool.query(
    "SELECT id, nombre, escudo_url, estado_torneo, baja_motivo FROM equipos WHERE torneo_id = $1 AND estado = 'aprobado'",
    [fase.torneo_id]
  );
  const sorteos = await obtenerSorteos(pool, fase.torneo_id, null);
  const tabla = calcularPosiciones(equipos, en_vivo ? proyectarPartidosEnCurso(partidos) : partidos, sorteos);
  if (fase.clasifican) tabla.forEach((f, i) => { f.clasifica = i < fase.clasifican; });
  if (en_vivo) {
    const enVivoIds = equiposEnVivo(partidos);
    tabla.forEach((f) => { f.en_vivo = enVivoIds.has(f.equipo_id); });
  }
  res.json([{ grupo_id: null, grupo_nombre: null, tabla }]);
}));

// Sortea el orden de 2 o más equipos que quedaron exactamente empatados en un
// grupo (mismos puntos, mini-liguilla, diferencia y goles). Verifica en vivo que
// ese conjunto todavía esté empatado antes de sortear, para no confiar a ciegas en
// lo que mande el cliente.
router.post('/grupos/:grupoId/sorteos', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDeGrupo(req.params.grupoId)), asyncHandler(async (req, res) => {
  const { equipos_ids, delegados_presentes } = req.body;
  if (!Array.isArray(equipos_ids) || equipos_ids.length < 2) {
    return res.status(400).json({ error: 'equipos_ids debe tener al menos 2 equipos' });
  }
  if (!delegados_presentes?.trim()) {
    return res.status(400).json({ error: 'Indica los delegados presentes en el sorteo' });
  }

  const { rows: grupoRows } = await pool.query(
    'SELECT g.*, f.torneo_id, f.id AS fase_id FROM grupos g JOIN fases f ON f.id = g.fase_id WHERE g.id = $1',
    [req.params.grupoId]
  );
  const grupo = grupoRows[0];
  if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });

  const { rows: equipos } = await pool.query(
    `SELECT e.id, e.nombre, e.escudo_url FROM grupo_equipos ge JOIN equipos e ON e.id = ge.equipo_id WHERE ge.grupo_id = $1`,
    [grupo.id]
  );
  const { rows: partidos } = await pool.query(
    'SELECT * FROM partidos WHERE fase_id = $1 AND (grupo_id = $2 OR es_intergrupo)',
    [grupo.fase_id, grupo.id]
  );
  const sorteosPrevios = await obtenerSorteos(pool, grupo.torneo_id, grupo.id);
  const tabla = calcularPosiciones(equipos, partidos, sorteosPrevios);

  const idsSet = new Set(equipos_ids.map(Number));
  const clave = [...idsSet].sort((a, b) => a - b).join('-');
  const encontrados = tabla.filter((f) => f.requiere_sorteo && idsSet.has(f.equipo_id));
  if (encontrados.length !== idsSet.size || encontrados.some((f) => f.grupo_empate !== clave)) {
    return res.status(400).json({ error: 'Ese conjunto de equipos ya no está empatado, o no coincide con un empate pendiente de sorteo' });
  }

  const orden = barajar([...idsSet]);
  await pool.query(
    `INSERT INTO sorteos_desempate (torneo_id, grupo_id, equipos_ids, orden_resultado, delegados_presentes, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [grupo.torneo_id, grupo.id, [...idsSet], orden, delegados_presentes.trim(), req.usuario.id]
  );

  const nombresPorId = new Map(equipos.map((e) => [e.id, e.nombre]));
  await registrar(pool, {
    torneoId: grupo.torneo_id, usuarioId: req.usuario.id,
    accion: `Sorteó el desempate entre ${[...idsSet].map((id) => nombresPorId.get(id)).join(', ')} en ${grupo.nombre} — orden: ${orden.map((id) => nombresPorId.get(id)).join(' > ')} — delegados presentes: ${delegados_presentes.trim()}`
  });

  res.status(201).json({ ok: true, orden_resultado: orden, orden_resultado_nombres: orden.map((id) => nombresPorId.get(id)) });
}));

// Genera el fixture todos-contra-todos dentro de cada grupo de una fase de tipo 'grupos'.
router.post('/:id/generar', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDeFase(req.params.id)), asyncHandler(async (req, res) => {
  const { rows: faseRows } = await pool.query('SELECT * FROM fases WHERE id = $1', [req.params.id]);
  const fase = faseRows[0];
  if (!fase) return res.status(404).json({ error: 'Fase no encontrada' });
  if (fase.tipo !== 'grupos') return res.status(400).json({ error: 'Esta acción solo aplica a fases de tipo grupos' });

  const existentes = await pool.query('SELECT 1 FROM partidos WHERE fase_id = $1 LIMIT 1', [fase.id]);
  if (existentes.rows[0]) return res.status(400).json({ error: 'Esta fase ya tiene un fixture generado' });

  const { rows: grupos } = await pool.query('SELECT * FROM grupos WHERE fase_id = $1', [fase.id]);
  if (grupos.length === 0) return res.status(400).json({ error: 'Primero crea al menos un grupo' });

  let generados = 0;
  const descansosPorJornada = {};
  for (const grupo of grupos) {
    const { rows: equipos } = await pool.query('SELECT equipo_id FROM grupo_equipos WHERE grupo_id = $1', [grupo.id]);
    if (equipos.length < 2) continue;
    const { partidos, descansos } = generarRoundRobinConDescansos(equipos.map((e) => e.equipo_id), !!fase.ida_vuelta);
    for (const p of partidos) {
      await pool.query(
        `INSERT INTO partidos (torneo_id, fase_id, grupo_id, jornada, equipo_local_id, equipo_visitante_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [fase.torneo_id, fase.id, grupo.id, p.jornada, p.equipo_local_id, p.equipo_visitante_id]
      );
      generados++;
    }
    if (fase.intergrupo) {
      Object.entries(descansos).forEach(([jornada, equipoId]) => {
        (descansosPorJornada[jornada] ||= []).push({ equipoId });
      });
    }
  }

  // El equipo que descansa cada jornada (por quedar su grupo con número impar) juega
  // un amistoso contra el que descansa en otro grupo esa misma jornada, en vez de
  // quedarse sin jugar — ese resultado sí suma a la tabla de cada uno.
  if (fase.intergrupo) {
    const cruces = emparejarDescansos(descansosPorJornada);
    for (const c of cruces) {
      await pool.query(
        `INSERT INTO partidos (torneo_id, fase_id, jornada, equipo_local_id, equipo_visitante_id, es_intergrupo)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [fase.torneo_id, fase.id, c.jornada, c.equipo_local_id, c.equipo_visitante_id]
      );
      generados++;
    }
  }

  res.status(201).json({ generados });
}));

router.delete('/:id/partidos', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDeFase(req.params.id)), asyncHandler(async (req, res) => {
  const existeJugado = await pool.query("SELECT 1 FROM partidos WHERE fase_id = $1 AND estado = 'jugado' LIMIT 1", [req.params.id]);
  if (existeJugado.rows[0]) {
    return res.status(400).json({ error: 'Ya hay resultados cargados en esta fase, no se puede borrar el fixture' });
  }
  await pool.query('DELETE FROM partidos WHERE fase_id = $1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;

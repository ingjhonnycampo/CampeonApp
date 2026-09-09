-- Esquema inicial: torneos, equipos, jugadores
-- Se ejecuta una vez en la base de datos de Supabase (SQL Editor -> pegar y correr)

-- Ajustes globales de la plataforma (una sola fila). Hoy solo trae el interruptor
-- de la transmisión en vivo — antes era una constante en el código del frontend
-- (features.js), ahora lo puede prender/apagar el admin desde el panel sin tocar
-- código ni redesplegar.
CREATE TABLE IF NOT EXISTS configuracion_global (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  transmision_habilitada BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO configuracion_global (id, transmision_habilitada) VALUES (1, false) ON CONFLICT (id) DO NOTHING;
ALTER TABLE configuracion_global ENABLE ROW LEVEL SECURITY;

-- Conteo interno de uso de las páginas públicas (sin cuenta): cuántas veces se
-- abrió cada cosa, y cuándo. A propósito NO guarda IP ni nada que identifique a
-- la persona — es un conteo de visitas, no un rastreo de personas.
CREATE TABLE IF NOT EXISTS visitas (
  id SERIAL PRIMARY KEY,
  ruta TEXT NOT NULL CHECK (ruta IN ('inicio', 'en_vivo', 'campeonato', 'partido', 'inscripcion')),
  torneo_id INTEGER REFERENCES torneos(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visitas_creado_en_idx ON visitas (creado_en);
CREATE INDEX IF NOT EXISTS visitas_torneo_idx ON visitas (torneo_id);
ALTER TABLE visitas ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS torneos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  modalidad TEXT NOT NULL CHECK (modalidad IN ('futbol', 'futbol9', 'futbol7', 'microfutbol', 'futbolsala')),
  duracion_tiempo_1 INTEGER NOT NULL DEFAULT 45,
  duracion_tiempo_2 INTEGER NOT NULL DEFAULT 45,
  fecha_inicio DATE,
  fecha_fin DATE,
  logo_url TEXT,
  inscripciones_desde TIMESTAMPTZ,
  inscripciones_hasta TIMESTAMPTZ,
  max_jugadores INTEGER NOT NULL DEFAULT 10,
  min_jugadores INTEGER NOT NULL DEFAULT 7,
  organizador TEXT,
  telefono_organizador TEXT,
  grupo_whatsapp TEXT, -- enlace de invitación al grupo de WhatsApp de delegados, mostrado en inscripciones
  reglamento_url TEXT, -- PDF del reglamento del campeonato, descargable desde inscripciones
  -- Toda esta configuracion se define de una sola vez al generar el fixture
  -- (endpoint POST /torneos/:id/generar-fixture) y se bloquea apenas se juega el
  -- primer partido: liga o grupos, cuantos grupos/clasifican/mejores terceros, si
  -- hay fase eliminatoria despues y como se arma (cuantos clasifican, 3er puesto,
  -- sembrado o sorteo).
  formato TEXT CHECK (formato IN ('liga', 'grupos')),
  ida_vuelta BOOLEAN NOT NULL DEFAULT false, -- si formato = 'liga': cada equipo juega 2 veces (ida y vuelta) contra cada rival
  grupos_cantidad INTEGER,
  grupos_clasifican INTEGER,
  grupos_mejores_terceros INTEGER NOT NULL DEFAULT 0,
  tiene_eliminatoria BOOLEAN NOT NULL DEFAULT false,
  elim_clasifican INTEGER, -- solo si formato = 'liga' (si es 'grupos', el total sale de grupos_cantidad*grupos_clasifican+mejores_terceros)
  elim_tercer_puesto BOOLEAN NOT NULL DEFAULT false,
  elim_modo TEXT NOT NULL DEFAULT 'sembrado' CHECK (elim_modo IN ('sembrado', 'sorteo')),
  elim_ida_vuelta BOOLEAN NOT NULL DEFAULT false, -- cada llave se juega ida y vuelta (menos la final y el 3er puesto, que siempre son partido unico)
  fixture_generado BOOLEAN NOT NULL DEFAULT false,
  -- Solo aplica a campeonatos ya finalizados: si el admin lo oculta, deja de
  -- aparecer en el hub público (/en-vivo) aunque siga existiendo con todos sus
  -- datos. Un campeonato en curso o por comenzar nunca se puede ocultar así.
  oculto_en_publico BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reglas_edad (
  id SERIAL PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  ambito TEXT NOT NULL CHECK (ambito IN ('planilla', 'cancha')),
  edad_minima INTEGER NOT NULL,
  cantidad_minima INTEGER NOT NULL,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS equipos (
  id SERIAL PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  escudo_url TEXT,
  delegado TEXT,
  delegado_telefono TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  motivo_rechazo TEXT,
  codigo_acceso TEXT UNIQUE,
  -- Estado del equipo DENTRO del torneo ya en marcha (independiente de "estado", que
  -- es la aprobacion de inscripcion). Si queda retirado o descalificado, sus partidos
  -- de liga/grupos pendientes se resuelven solos por walkover a favor del rival.
  estado_torneo TEXT NOT NULL DEFAULT 'activo' CHECK (estado_torneo IN ('activo', 'retirado', 'descalificado')),
  baja_motivo TEXT,
  baja_fecha TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jugadores (
  id SERIAL PRIMARY KEY,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  cedula TEXT, -- obligatoria a nivel de aplicacion (se usa para detectar inscripciones duplicadas)
  fecha_nacimiento DATE,
  numero_camiseta INTEGER,
  foto_url TEXT,
  documento_url TEXT,
  estado_validacion TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_validacion IN ('pendiente', 'validado', 'rechazado')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'arbitro', 'delegado', 'organizador')),
  equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un arbitro u organizador solo puede operar los campeonatos a los que fue
-- asignado aqui (el organizador tiene control total sobre esos campeonatos,
-- como si fuera admin, pero solo de esos). El admin (dueno de la plataforma)
-- no pasa por esta tabla: ve y controla todo siempre.
CREATE TABLE IF NOT EXISTS torneo_arbitros (
  torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (torneo_id, usuario_id)
);

-- Una fase es una etapa del torneo (liga simple, grupos, o eliminatoria). Una fase
-- de tipo 'eliminacion' puede tener fase_origen_id apuntando a la fase de la que
-- saca los clasificados (segun el campo "clasifican" de esa fase de origen), o bien
-- clasifican_de_fixture=true para tomar los clasificados directo del fixture
-- principal del campeonato (el modulo de Liga simple, sin pasar por una fase).
CREATE TABLE IF NOT EXISTS fases (
  id SERIAL PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('liga', 'grupos', 'eliminacion')),
  clasifican INTEGER, -- 'grupos': cuantos por grupo. 'eliminacion' con clasifican_de_fixture: total.
  mejores_terceros INTEGER NOT NULL DEFAULT 0, -- solo 'grupos': cupos extra para los mejores tan-tantos (util con numero impar de grupos)
  fase_origen_id INTEGER REFERENCES fases(id) ON DELETE SET NULL,
  clasifican_de_fixture BOOLEAN NOT NULL DEFAULT false,
  jugar_tercer_puesto BOOLEAN NOT NULL DEFAULT false, -- solo 'eliminacion': si se juega el partido por el 3er puesto entre los perdedores de semifinal
  modo TEXT NOT NULL DEFAULT 'sembrado' CHECK (modo IN ('sembrado', 'sorteo')), -- solo 'eliminacion': como se arma la primera ronda
  intergrupo BOOLEAN NOT NULL DEFAULT false, -- solo 'grupos': si el equipo que descansa cada jornada (grupo impar) juega un amistoso intergrupo que cuenta para su propia tabla
  ida_vuelta BOOLEAN NOT NULL DEFAULT false, -- solo 'grupos': cada equipo juega 2 veces (ida y vuelta) contra cada rival del grupo
  elim_ida_vuelta BOOLEAN NOT NULL DEFAULT false, -- solo 'eliminacion': cada llave se juega ida y vuelta (menos la final y el 3er puesto)
  orden INTEGER NOT NULL DEFAULT 1,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo se usa cuando la fase es de tipo 'grupos'.
CREATE TABLE IF NOT EXISTS grupos (
  id SERIAL PRIMARY KEY,
  fase_id INTEGER NOT NULL REFERENCES fases(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grupo_equipos (
  grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  PRIMARY KEY (grupo_id, equipo_id)
);

-- En una fase de eliminatoria se genera el cuadro COMPLETO de una vez: la primera
-- ronda con equipos reales, y las rondas siguientes (incluido el partido por el 3er
-- puesto) como casillas "por definir" (equipo_local_id/equipo_visitante_id en null)
-- que apuntan, via origen_local_id/origen_visitante_id, al partido anterior de donde
-- sale ese cupo. Al guardar un resultado, se propaga automaticamente el ganador (o el
-- perdedor, si el destino es el partido por el 3er puesto) a esas casillas.
CREATE TABLE IF NOT EXISTS partidos (
  id SERIAL PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  fase_id INTEGER REFERENCES fases(id) ON DELETE CASCADE,
  grupo_id INTEGER REFERENCES grupos(id) ON DELETE CASCADE,
  jornada INTEGER NOT NULL,
  equipo_local_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE,
  equipo_visitante_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE,
  origen_local_id INTEGER REFERENCES partidos(id) ON DELETE SET NULL,
  origen_visitante_id INTEGER REFERENCES partidos(id) ON DELETE SET NULL,
  orden_semilla_local INTEGER, -- solo ronda 1: indice (0-based) del puesto clasificado que va aqui; editable antes de jugar
  orden_semilla_visitante INTEGER,
  -- Si esta fila es la "vuelta" de una llave de eliminatoria a doble partido, apunta
  -- a la "ida" de esa misma llave (que es la que de verdad queda enlazada via
  -- origen_local_id/origen_visitante_id hacia la ronda siguiente). Sus equipos
  -- siempre quedan sincronizados con los de la ida, pero invertidos (local <-> visitante).
  partido_ida_id INTEGER REFERENCES partidos(id) ON DELETE CASCADE,
  goles_local INTEGER,
  goles_visitante INTEGER,
  ganador_id INTEGER REFERENCES equipos(id), -- solo para eliminatoria, si hubo empate y se definio aparte (penales)
  penales_local INTEGER, -- marcador de la tanda de penales (solo si empatado quedo, junto con ganador_id)
  penales_visitante INTEGER,
  es_tercer_puesto BOOLEAN NOT NULL DEFAULT false, -- partido por el 3er puesto, generado junto con la final
  es_intergrupo BOOLEAN NOT NULL DEFAULT false, -- amistoso entre los equipos que descansan de dos grupos distintos (grupo_id queda null; cuenta para la tabla propia de cada uno)
  es_walkover BOOLEAN NOT NULL DEFAULT false, -- se resolvio 3-0 porque un equipo no se presento (o quedo de baja)
  walkover_ausente_id INTEGER REFERENCES equipos(id), -- cual de los dos equipos fue el que no se presento
  estado TEXT NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado', 'reprogramado', 'en_curso', 'jugado')),
  fecha_hora TIMESTAMPTZ, -- fecha y hora programada del partido; si se cambia despues de tener una, el estado pasa a 'reprogramado'
  -- Cronometro de la planilla en vivo. tiempo_actual va avanzando
  -- null -> 'primer_tiempo' -> 'descanso' -> 'segundo_tiempo' -> 'finalizado'.
  -- cronometro_inicio es la marca de tiempo real de cuando arranco el tramo que esta
  -- corriendo ahora mismo (null si esta en pausa o no ha arrancado); cronometro_acumulado_seg
  -- son los segundos ya acumulados del tiempo_actual antes de esa marca (se reinicia a 0
  -- cada vez que arranca un tiempo nuevo). Los segundos totales de un tiempo en curso son
  -- cronometro_acumulado_seg + (now() - cronometro_inicio) si esta corriendo.
  tiempo_actual TEXT CHECK (tiempo_actual IN ('primer_tiempo', 'descanso', 'segundo_tiempo', 'finalizado')),
  cronometro_inicio TIMESTAMPTZ,
  cronometro_acumulado_seg INTEGER NOT NULL DEFAULT 0,
  -- Firma del arbitro/anotador que cierra la planilla, para el informe imprimible.
  firma_arbitro TEXT, -- imagen PNG en base64 (data URL) dibujada en la pantalla de firma
  firmado_por INTEGER REFERENCES usuarios(id), -- cuenta con la que se firmo
  firmante_nombre TEXT, -- nombre de la persona que realmente firmo (puede no ser el nombre de la cuenta)
  firmado_en TIMESTAMPTZ,
  observaciones_arbitro TEXT,
  -- Firma de cada delegado de equipo certificando la planilla ANTES de iniciar
  -- el partido (no al final) — se captura en el mismo dispositivo del árbitro
  -- (los delegados no tienen una sesión propia para esto), una sola vez, y es
  -- requisito para poder confirmar/guardar la alineación de ese equipo.
  firma_delegado_local TEXT,
  firmante_delegado_local TEXT,
  firmado_delegado_local_en TIMESTAMPTZ,
  firma_delegado_visitante TEXT,
  firmante_delegado_visitante TEXT,
  firmado_delegado_visitante_en TIMESTAMPTZ,
  -- Confirmación del equipo antes de iniciar (solo aplica donde no hay alineación
  -- formal, ej. microfútbol — en fútbol la alineación guardada ya cumple ese rol).
  -- Requiere que el delegado ya haya firmado.
  confirmado_local BOOLEAN NOT NULL DEFAULT false,
  confirmado_visitante BOOLEAN NOT NULL DEFAULT false,
  jugado_desde TIMESTAMPTZ, -- hora real en que se le dio "Iniciar partido" (no la programada)
  jugado_hasta TIMESTAMPTZ, -- hora real en que se finalizo
  -- Segundos realmente jugados en el primer tiempo (puede ser menos o mas que
  -- duracion_tiempo_1 del torneo, si el arbitro lo corto antes o le agrego tiempo).
  -- Se usa para calcular bien el minuto mostrado durante el segundo tiempo.
  tiempo1_duracion_real_seg INTEGER,
  -- Enlace de transmisión en vivo de ESTE partido (ej. un video "Unlisted" de
  -- YouTube Live, o de Facebook Live), que se embebe en la página pública cuando
  -- está presente. Cada partido tiene el suyo — no se comparte entre partidos.
  url_transmision TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quien de cada equipo esta en la planilla del partido: titular o suplente, y a que
-- minuto entro/salio si hubo cambio (null si titular que no salio, o suplente que no entro).
CREATE TABLE IF NOT EXISTS partido_alineacion (
  id SERIAL PRIMARY KEY,
  partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  titular BOOLEAN NOT NULL DEFAULT false,
  entro_minuto INTEGER,
  salio_minuto INTEGER,
  UNIQUE (partido_id, jugador_id)
);

-- Número de camiseta que un jugador usa EN ESE PARTIDO puntual, por si difiere
-- del número con el que quedó inscrito (se confirma/corrige al armar la
-- planilla) — no altera el número de inscripción del jugador, solo cómo se
-- muestra y se busca en la planilla y el informe de este partido.
CREATE TABLE IF NOT EXISTS partido_numero_camiseta (
  id SERIAL PRIMARY KEY,
  partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  UNIQUE (partido_id, jugador_id)
);

-- Goles anotados durante el partido, con jugador y minuto (para la tabla de
-- goleadores). equipo_id es el equipo al que le CUENTA el gol (si es en propia
-- puerta, es el equipo RIVAL del jugador que la metio).
-- minuto y tiempo son relativos AL TIEMPO en el que ocurrio (no un minuto corrido
-- de partido): un gol al minuto 10 del segundo tiempo queda minuto=10,
-- tiempo='segundo_tiempo' (se muestra "10' ST"), no minuto=55. Los calcula el
-- servidor a partir del cronometro real del partido en el momento del evento, no
-- el jugador ni el cliente.
CREATE TABLE IF NOT EXISTS partido_goles (
  id SERIAL PRIMARY KEY,
  partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  jugador_id INTEGER REFERENCES jugadores(id) ON DELETE SET NULL,
  minuto INTEGER,
  -- Si el evento ocurrió después de cumplirse el tiempo reglamentario, `minuto`
  -- queda fijo en la duración configurada (ej. 20) y acá va lo que llevaba
  -- corrido el tiempo de adición (ej. 3, para mostrar "20+3'"). NULL = tiempo regular.
  minuto_adicion INTEGER,
  tiempo TEXT CHECK (tiempo IN ('primer_tiempo', 'segundo_tiempo')),
  en_propia_puerta BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tarjetas amarillas/rojas/azules mostradas durante el partido.
CREATE TABLE IF NOT EXISTS partido_tarjetas (
  id SERIAL PRIMARY KEY,
  partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  minuto INTEGER,
  minuto_adicion INTEGER, -- ver comentario equivalente en partido_goles
  tiempo TEXT CHECK (tiempo IN ('primer_tiempo', 'segundo_tiempo')),
  tipo TEXT NOT NULL CHECK (tipo IN ('amarilla', 'roja', 'azul')), -- azul: cambio obligatorio (el jugador no sigue, pero el equipo no queda con uno menos)
  -- true SOLO en la fila de tipo 'roja' que el servidor inserta automaticamente
  -- cuando esta es la segunda amarilla del jugador en el mismo partido. Distingue
  -- esa expulsion (sancion de 1 partido) de una roja directa (sancion de 2) — ver
  -- server/sanciones.js.
  doble_amarilla BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cuando el organizador/admin confirma que un jugador sancionado ya pagó el valor
-- de la tarjeta, se registra aquí — habilita al jugador para el primer partido
-- pendiente que le tocaba cumplir (o, si la sancion tiene partidos obligatorios
-- de por medio como la roja, para el que sigue de esos). Una fila por tarjeta.
CREATE TABLE IF NOT EXISTS sancion_habilitaciones (
  id SERIAL PRIMARY KEY,
  tarjeta_id INTEGER NOT NULL UNIQUE REFERENCES partido_tarjetas(id) ON DELETE CASCADE,
  habilitado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reglas de sancion propias de CADA campeonato (se configuran al crearlo/editarlo):
-- cuantas fechas obligatorias trae cada tipo de tarjeta y cuanto vale la multa. Si
-- un torneo no tiene fila para un tipo, se usa el default de server/sanciones.js
-- (amarilla/azul: solo el partido — 0 fechas; doble_amarilla: 1; roja_directa: 2).
CREATE TABLE IF NOT EXISTS torneo_reglas_sancion (
  id SERIAL PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  tipo_sancion TEXT NOT NULL CHECK (tipo_sancion IN ('amarilla', 'doble_amarilla', 'roja_directa', 'azul')),
  fechas_obligatorias INTEGER NOT NULL DEFAULT 0 CHECK (fechas_obligatorias BETWEEN 0 AND 5),
  multa NUMERIC(12, 2) NOT NULL DEFAULT 0,
  UNIQUE (torneo_id, tipo_sancion)
);

-- Expulsión DEFINITIVA de un jugador del campeonato por una falta disciplinaria
-- grave (agredir a un árbitro, etc.) — una tarjeta no alcanza para esto. El
-- jugador queda vetado de por vida en el torneo, y el EQUIPO completo queda sin
-- poder jugar ningún partido más hasta que se marque la multa como pagada.
CREATE TABLE IF NOT EXISTS jugador_expulsiones (
  id SERIAL PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  multa NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pagado BOOLEAN NOT NULL DEFAULT false,
  pagado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  pagado_en TIMESTAMPTZ,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Módulo DISCIPLINA: sanciones administrativas "de oficio" por conductas
-- EXTRADEPORTIVAS (no vistas en el partido) — separado por completo del sistema
-- de sanciones por tarjeta. Solo admin/organizador las gestionan.
--
-- Jugador: multa y/o suspensión por N fechas (bloquea solo al jugador, el equipo
-- sigue jugando normal — NO genera walkover). Si la falta es tan grave que
-- amerita expulsión definitiva, se usa jugador_expulsiones (ya existente), no
-- esta tabla.
CREATE TABLE IF NOT EXISTS disciplina_jugador (
  id SERIAL PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  fechas INTEGER NOT NULL DEFAULT 0 CHECK (fechas BETWEEN 0 AND 10),
  multa NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pagado BOOLEAN NOT NULL DEFAULT false,
  pagado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  pagado_en TIMESTAMPTZ,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Equipo: por ahora SOLO sanción económica (no se suspende por fechas). Mientras
-- la multa esté sin pagar, el equipo no puede jugar. La expulsión de oficio de un
-- equipo se hace con la función ya existente aplicarBajaEquipo (misma que usa el
-- botón "Descalificar" y la regla automática de 2 inasistencias).
CREATE TABLE IF NOT EXISTS disciplina_equipo (
  id SERIAL PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  multa NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pagado BOOLEAN NOT NULL DEFAULT false,
  pagado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  pagado_en TIMESTAMPTZ,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cambios de jugador, como evento propio para la linea de tiempo del informe y de
-- la vista publica (antes solo quedaban implicitos en partido_alineacion).
CREATE TABLE IF NOT EXISTS partido_cambios (
  id SERIAL PRIMARY KEY,
  partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  jugador_sale_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  jugador_entra_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  minuto INTEGER,
  minuto_adicion INTEGER, -- ver comentario equivalente en partido_goles
  tiempo TEXT CHECK (tiempo IN ('primer_tiempo', 'segundo_tiempo')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hitos del cronometro (inicio del partido, fin del primer tiempo, inicio del
-- segundo tiempo, fin del partido), para que salgan como un evento mas en la
-- linea de tiempo del informe y de la pagina publica, no solo el aviso flotante.
CREATE TABLE IF NOT EXISTS partido_hitos (
  id SERIAL PRIMARY KEY,
  partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('inicio_partido', 'fin_primer_tiempo', 'inicio_segundo_tiempo', 'fin_partido')),
  minuto INTEGER,
  minuto_adicion INTEGER, -- ver comentario equivalente en partido_goles (el fin de un tiempo puede caer en adición)
  tiempo TEXT CHECK (tiempo IN ('primer_tiempo', 'segundo_tiempo')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada vez que se corrige el marcador de un partido que YA estaba jugado (por
-- ejemplo, por una impugnacion), queda un registro de por que se hizo el cambio.
-- La primera vez que se carga un resultado (estaba 'programado') no requiere motivo.
CREATE TABLE IF NOT EXISTS partido_ediciones (
  id SERIAL PRIMARY KEY,
  partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  goles_local_anterior INTEGER,
  goles_visitante_anterior INTEGER,
  goles_local_nuevo INTEGER NOT NULL,
  goles_visitante_nuevo INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  editado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cuando 2 o mas equipos quedan exactamente empatados en todo (puntos, mini-liguilla
-- entre ellos, diferencia y goles generales), la unica forma valida de desempatar es
-- un sorteo. Queda registrado el conjunto exacto de equipos que estaban empatados,
-- el orden que salio, y quienes presenciaron el sorteo (los delegados de esos
-- equipos), para que quede como prueba de que fue al azar.
CREATE TABLE IF NOT EXISTS sorteos_desempate (
  id SERIAL PRIMARY KEY,
  torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  grupo_id INTEGER REFERENCES grupos(id) ON DELETE CASCADE, -- null si el empate es en la tabla general (liga)
  equipos_ids INTEGER[] NOT NULL,
  orden_resultado INTEGER[] NOT NULL,
  delegados_presentes TEXT NOT NULL,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bitacora general: registro legible de las acciones importantes que se hacen en
-- la plataforma (crear/editar campeonatos, aprobar equipos, validar jugadores,
-- cargar o corregir resultados, usuarios, etc.).
CREATE TABLE IF NOT EXISTS bitacora (
  id SERIAL PRIMARY KEY,
  torneo_id INTEGER REFERENCES torneos(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  accion TEXT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bitacora_torneo_idx ON bitacora (torneo_id, creado_en DESC);

-- Seguridad: activa Row Level Security en TODAS las tablas públicas. Esta app no
-- usa la API REST automática de Supabase (PostgREST) ni el rol anon/authenticated
-- — el backend se conecta directo a Postgres con el rol "postgres" (dueño de las
-- tablas, con rolbypassrls), así que esto no le cambia nada a las consultas del
-- backend. Sin esto, cualquiera con la llave "anon" del proyecto podría leer o
-- escribir estas tablas directo por PostgREST, sin pasar por el backend.
ALTER TABLE bitacora ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplina_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplina_jugador ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fases ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupo_equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE jugador_expulsiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE jugadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE partido_alineacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE partido_cambios ENABLE ROW LEVEL SECURITY;
ALTER TABLE partido_ediciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE partido_goles ENABLE ROW LEVEL SECURITY;
ALTER TABLE partido_hitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE partido_tarjetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE partidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reglas_edad ENABLE ROW LEVEL SECURITY;
ALTER TABLE sancion_habilitaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE sorteos_desempate ENABLE ROW LEVEL SECURITY;
ALTER TABLE torneo_arbitros ENABLE ROW LEVEL SECURITY;
ALTER TABLE torneo_reglas_sancion ENABLE ROW LEVEL SECURITY;
ALTER TABLE torneos ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

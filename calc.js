// Mi Balance — MOTOR DE CÁLCULO (11-11-2026).
// Aquí están TODAS las reglas financieras. No dibuja pantallas: recibe los datos guardados y devuelve los resultados.
// Regla de oro: cada cifra se puede rastrear (campo "traza") y nada se inventa (lo que falta queda "pendiente").
(function (raiz) {
  'use strict';

  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const NIVEL = { confirmado: 0, aproximado: 1, pendiente: 2, inconsistente: 3 };

  const esNum = v => typeof v === 'number' && isFinite(v);

  // ---------- Fechas (siempre texto AAAA-MM-DD, hora local) ----------
  function fechaDe(s) { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function aTexto(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function hoy() { return aTexto(new Date()); }
  function diaSemana(s) { return fechaDe(s).getDay(); }
  function sumarDias(s, n) { const d = fechaDe(s); d.setDate(d.getDate() + n); return aTexto(d); }
  function mesDe(s) { return s.slice(0, 7); }
  function diasDelMes(mes) { const p = mes.split('-'); return new Date(+p[0], +p[1], 0).getDate(); }
  function sumarMes(mes, n) { const p = mes.split('-'); return aTexto(new Date(+p[0], +p[1] - 1 + n, 1)).slice(0, 7); }
  function letraDe(n) { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }

  // ---------- Formatos colombianos ($95.000 · 80,8 km) ----------
  function miles(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  const fmt = {
    dinero(v) { if (!esNum(v)) return '—'; const n = Math.round(v); return (n < 0 ? '−' : '') + '$' + miles(Math.abs(n)); },
    num(v, dec = 1) {
      if (!esNum(v)) return '—';
      const f = Math.pow(10, dec), r = Math.round(Math.abs(v) * f) / f;
      const ent = Math.floor(r), frac = Math.round((r - ent) * f);
      return (v < 0 && r > 0 ? '−' : '') + miles(ent) + (frac ? ',' + String(frac).padStart(dec, '0').replace(/0+$/, '') : '');
    },
    fecha(f) { const d = fechaDe(f); return DIAS_CORTOS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3); },
    fechaLarga(f) { const d = fechaDe(f); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear(); },
    fechaNum(f) { const p = f.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; },
    mes(m) { const p = m.split('-'); const t = MESES[+p[1] - 1]; return t[0].toUpperCase() + t.slice(1) + ' ' + p[0]; }
  };

  // Valor vigente en una fecha: lista [{desde, valor}]. Los cambios nunca tocan fechas anteriores a su "desde".
  function vigente(lista, fecha) {
    if (!lista || !lista.length) return null;
    let el = null;
    for (const it of lista) if (it.desde <= fecha && (!el || it.desde >= el.desde)) el = it;
    if (!el) el = lista.reduce((a, b) => (a.desde <= b.desde ? a : b));
    return el.valor;
  }

  const CONFIG_INICIAL = {
    version: 1,
    precioGalon: [{ desde: '2026-11-01', valor: 16800 }],
    metaDiaria: [{ desde: '2026-11-01', valor: 100000 }],
    ahorroJornada: [{ desde: '2026-11-01', valor: 15000 }],
    cuotaMensual: [{ desde: '2026-11-01', valor: 1240000 }],
    kmReferencia: [{ desde: '2026-11-01', valor: 90 }],
    diasOficiales: [1, 3, 4, 5, 6],      // lunes, miércoles, jueves, viernes, sábado
    rendimientoConAire: 37,              // km por galón estimado andando con aire (hasta tener intervalos reales)
    aireConsumeMas: 10,                  // % más de gasolina por km con el aire prendido (ajustable)
    saldoInicialPozo: { '2026-11': 0 },  // con cuánto arranca el Pozo cada mes (lo dice Edwin en el cierre)
    inicio: '2026-11-01',
    ultimoRespaldo: null,
    tema: 'oscuro'
  };

  function ordenTanqueo(a, b) {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    const ha = a.hora || '', hb = b.hora || '';
    if (ha !== hb) return ha < hb ? -1 : 1;
    return (a.orden || 0) - (b.orden || 0);
  }

  function peor(a, b) { return NIVEL[a] >= NIVEL[b] ? a : b; }

  // =====================================================================================
  function calcular(datos, hoyTxt) {
    hoyTxt = hoyTxt || hoy();
    const cfg = Object.assign({}, CONFIG_INICIAL, (datos && datos.config) || {});
    const k = (+cfg.aireConsumeMas || 0) / 100;
    const precio = f => vigente(cfg.precioGalon, f);
    const D = fmt.dinero, N = fmt.num;

    // ---------- 1. Tanqueos e intervalos (cada tanque LLENO abre un intervalo; el siguiente lleno lo cierra) ----------
    const tq = ((datos && datos.tanqueos) || []).slice().sort(ordenTanqueo);
    const llenos = tq.filter(t => t.lleno);
    const intervalos = [], intPorId = {};
    llenos.forEach((t, i) => {
      const sig = llenos[i + 1] || null;
      const ia = tq.indexOf(t), ib = sig ? tq.indexOf(sig) : tq.length - 1;
      const dentro = tq.slice(ia + 1, ib + 1);   // tanqueos parciales intermedios + el de cierre
      const it = {
        id: t.id, inicio: t, fin: sig, nombre: t.letra + ' → ' + (sig ? sig.letra : '…'), cerrado: !!sig, tanqueos: dentro,
        km: 0, kmPeso: 0, tramos: [], galones: null, valor: null, aproximado: false, valido: false
      };
      if (sig) {
        let g = 0, v = 0, okG = true, okV = true;
        for (const x of dentro) {
          if (esNum(x.galones)) g += x.galones; else okG = false;
          if (esNum(x.valor)) v += x.valor; else okV = false;
          if (x.estado && x.estado !== 'confirmado') it.aproximado = true;
        }
        it.galones = okG ? g : null;
        it.valor = okV ? v : null;
      }
      intervalos.push(it); intPorId[t.id] = it;
    });
    function intervaloPorFecha(f) { let r = null; for (const it of intervalos) if (it.inicio.fecha <= f) r = it; return r; }

    // ---------- 2. Tramos de cada jornada (km, aire y a qué intervalo pertenecen) ----------
    const jornadas = ((datos && datos.jornadas) || []).slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const tramosDe = {};
    for (const j of jornadas) {
      const lista = [];
      const usaKm = j.tipo === 'oficial' || j.tipo === 'excepcional';
      (usaKm ? j.tramos || [] : []).forEach((t, i) => {
        const km = esNum(t.kmIni) && esNum(t.kmFin) ? Math.round((t.kmFin - t.kmIni) * 10) / 10 : null;
        const c = t.horasCon, s = t.horasSin;
        const aireConocido = esNum(c) && esNum(s) && c + s > 0;
        const frac = aireConocido ? c / (c + s) : 0.5;   // sin dato de aire: mitad y mitad (queda "aproximado")
        const peso = 1 + k * frac;                       // km "equivalentes sin aire"
        let it = intPorId[t.intervalo] || null, auto = false;
        if (!it) { it = intervaloPorFecha(j.fecha); auto = true; }
        const tc = {
          n: i + 1, km, horas: (esNum(c) ? c : 0) + (esNum(s) ? s : 0), horasCon: c, horasSin: s,
          aireConocido, frac, peso, kmPeso: km != null ? km * peso : null, intervalo: it, auto, original: t
        };
        if (it && km != null) { it.km += km; it.kmPeso += tc.kmPeso; it.tramos.push({ fecha: j.fecha, tramo: tc }); }
        lista.push(tc);
      });
      tramosDe[j.fecha] = lista;
    }

    // ---------- 3. Rendimiento real (intervalos cerrados y completos) y referencia para lo provisional ----------
    let G = 0, W = 0, K = 0, V = 0;
    for (const it of intervalos) {
      if (it.cerrado && it.galones > 0 && esNum(it.valor) && it.km > 0) {
        it.valido = true;
        it.rendimiento = it.km / it.galones;
        it.costoKm = it.valor / it.km;
        it.costoPeso = it.valor / it.kmPeso;
        it.precioGalon = it.valor / it.galones;
        G += it.galones; W += it.kmPeso; K += it.km; V += it.valor;
      }
    }
    const validos = intervalos.filter(i => i.valido);
    const ref = {
      real: W > 0,
      galPorPeso: W > 0 ? G / W : 1 / (cfg.rendimientoConAire * (1 + k)),
      mezcla: K > 0 ? W / K : 1 + k,
      rendimiento: K > 0 ? K / G : cfg.rendimientoConAire,   // km totales ÷ galones totales (no promedio simple)
      costoKmReal: K > 0 ? V / K : null,
      km: K, galones: G, valor: V,
      mejor: validos.reduce((a, b) => (!a || b.rendimiento > a.rendimiento ? b : a), null),
      peor: validos.reduce((a, b) => (!a || b.rendimiento < a.rendimiento ? b : a), null)
    };
    ref.costoKm = f => precio(f) * ref.galPorPeso * ref.mezcla;           // costo por km de referencia en una fecha
    ref.presupuestado = f => precio(f) / cfg.rendimientoConAire;           // lo presupuestado con el rendimiento estimado
    for (const it of intervalos) if (!it.valido) it.costoKmEstimado = ref.costoKm(it.inicio.fecha);

    // Costo de cada tramo: real si su intervalo ya cerró; si no, provisional con la referencia y el precio vigente.
    for (const f in tramosDe) for (const tc of tramosDe[f]) {
      if (tc.km == null) { tc.costo = 0; tc.estado = 'pendiente'; continue; }
      const it = tc.intervalo;
      if (it && it.valido) {
        tc.costoKmUsado = it.costoPeso * tc.peso; tc.costo = tc.km * tc.costoKmUsado;
        tc.estado = it.aproximado ? 'aproximado' : 'real';
      } else {
        tc.costoKmUsado = precio(f) * ref.galPorPeso * tc.peso; tc.costo = tc.km * tc.costoKmUsado;
        tc.estado = 'estimado';
      }
    }

    // ---------- 4. Movimientos guardados del Pozo (apoyos y gastos) ----------
    const movs = ((datos && datos.pozo) || []).slice();
    const apoyosDe = {};
    for (const m of movs) if (m.tipo === 'apoyo' && m.jornada) (apoyosDe[m.jornada] = apoyosDe[m.jornada] || []).push(m);

    // ---------- 5. Cada jornada ----------
    const res = [], porFecha = {};
    for (const j of jornadas) {
      const f = j.fecha, dow = diaSemana(f), oficialDia = cfg.diasOficiales.includes(dow);
      const M = vigente(cfg.metaDiaria, f), A = vigente(cfg.ahorroJornada, f), kmRef = vigente(cfg.kmReferencia, f);
      const tipo = j.tipo || (oficialDia ? 'oficial' : 'descanso');
      const trabaja = tipo === 'oficial' || tipo === 'excepcional';
      const tramos = tramosDe[f] || [];
      const I = esNum(j.ingreso) ? j.ingreso : null, ing = I || 0;
      const km = Math.round(tramos.reduce((s, t) => s + (t.km || 0), 0) * 10) / 10;
      const F = tramos.reduce((s, t) => s + (t.costo || 0), 0);
      const horas = tramos.reduce((s, t) => s + t.horas, 0);
      const horasCon = tramos.reduce((s, t) => s + (esNum(t.horasCon) ? t.horasCon : 0), 0);
      const horasSin = tramos.reduce((s, t) => s + (esNum(t.horasSin) ? t.horasSin : 0), 0);
      const aps = apoyosDe[f] || [];
      const S = aps.filter(m => m.estado === 'confirmado').reduce((s, m) => s + m.valor, 0);
      const Sp = aps.filter(m => m.estado !== 'confirmado').reduce((s, m) => s + m.valor, 0);
      let combEstado = 'real';
      for (const t of tramos) if (t.estado === 'estimado') combEstado = 'estimado'; else if (t.estado === 'aproximado' && combEstado === 'real') combEstado = 'aproximado';
      if (tramos.some(t => t.estado === 'pendiente')) combEstado = 'pendiente';

      const r = {
        fecha: f, dia: DIAS[dow], diaCorto: DIAS_CORTOS[dow], oficialDia, tipo, trabaja, jornada: j, tramos,
        ingreso: I, km, kmRef, horas, horasCon, horasSin, combustible: F, combEstado,
        meta: 0, ahorro: 0, ahorroCubierto: 0, ahorroSinCubrir: 0, combSinCubrir: 0, excedente: 0,
        apoyo: S, apoyoPendiente: Sp, apoyos: aps, sugerido: 0, faltante: 0,
        cuota: 0, cuotaOperativa: 0, cuotaApoyo: 0, cubre: { comb: 0, ahorro: 0, cuota: 0 }, deIngreso: { comb: 0, ahorro: 0, cuota: 0 },
        difMeta: null, difKm: trabaja ? km - kmRef : null, metaCumplida: false, metaConPozo: false,
        ingresoKm: trabaja && I != null && km > 0 ? I / km : null,
        ingresoHora: trabaja && I != null && horas > 0 ? I / horas : null,
        intervalos: [...new Set(tramos.filter(t => t.intervalo).map(t => t.intervalo.nombre))],
        alertas: [], traza: [], estado: 'confirmado'
      };
      const al = (nivel, texto, soloJornada) => r.alertas.push({ nivel, texto, soloJornada: !!soloJornada });
      const tz = t => r.traza.push(t);

      // Traza del combustible (igual para oficial y excepcional)
      if (trabaja) {
        tramos.forEach(t => {
          const it = t.intervalo;
          const origen = t.estado === 'real' ? 'real del intervalo ' + it.nombre : t.estado === 'aproximado' ? 'intervalo ' + it.nombre + ' (galones aproximados)' : t.estado === 'estimado' ? 'provisional: ' + (it ? 'intervalo ' + it.nombre + ' abierto' : 'sin intervalo') + ', precio ' + D(precio(f)) + '/galón' : 'faltan los km';
          tz('⛽ Tramo ' + t.n + ': ' + (t.km != null ? N(t.km) + ' km × ' + D(t.costoKmUsado) + '/km = ' + D(t.costo) : 'km pendientes') + ' (' + origen + ')');
          tz('   Aire: ' + (t.aireConocido ? N(t.horasCon) + ' h con aire y ' + N(t.horasSin) + ' h sin aire' : 'sin dato (se tomó mitad y mitad)') + ' → factor ' + N(t.peso, 3));
        });
        tz('⛽ Combustible del día: ' + D(F));
      }

      if (tipo === 'oficial') {
        r.meta = M;
        const base = Math.min(ing, M);
        r.excedente = Math.max(0, ing - M);
        const combIng = Math.min(base, F), ahIng = Math.min(A, Math.max(0, base - F)), cuotaIng = Math.max(0, base - F - A);
        const faltaComb = F - combIng, faltaAh = A - ahIng;
        r.deIngreso = { comb: combIng, ahorro: ahIng, cuota: cuotaIng };
        r.sugerido = Math.max(M - base, faltaComb + faltaAh, 0);
        const sComb = Math.min(S, faltaComb), sAh = Math.min(S - sComb, faltaAh), sCuota = Math.max(0, S - sComb - sAh);
        r.cubre = { comb: sComb, ahorro: sAh, cuota: sCuota };
        r.ahorro = A; r.ahorroCubierto = ahIng + sAh; r.ahorroSinCubrir = faltaAh - sAh; r.combSinCubrir = faltaComb - sComb;
        r.cuotaOperativa = cuotaIng; r.cuotaApoyo = sCuota; r.cuota = cuotaIng + sCuota;
        r.faltante = Math.max(0, r.sugerido - S);
        r.difMeta = ing - M;
        r.metaCumplida = I != null && I >= M;
        r.metaConPozo = !r.metaCumplida && I != null && r.faltante < 1 && S > 0;
        tz('💵 Ingreso bruto: ' + D(I) + ' · Meta: ' + D(M));
        if (r.excedente > 0) tz('💧 Al Pozo: ' + D(ing) + ' − ' + D(M) + ' = ' + D(r.excedente));
        tz('🐷 Ahorro obligatorio: ' + D(A));
        tz('🚗 Para la cuota (de la operación): ' + D(base) + ' − ' + D(F) + ' − ' + D(A) + (base - F - A < 0 ? ' = ' + D(base - F - A) + ' → ' + D(0) : ' = ' + D(cuotaIng)));
        if (M - base > 0) tz('📉 Faltan para la meta: ' + D(M) + ' − ' + D(ing) + ' = ' + D(M - base));
        if (S > 0) tz('💧 Apoyo del Pozo confirmado ' + D(S) + ': combustible ' + D(sComb) + ' · ahorro ' + D(sAh) + ' · cuota ' + D(sCuota) + ' (traslado interno, no es ingreso de Uber)');
      } else if (tipo === 'excepcional') {
        r.excedente = ing;
        tz('💵 Ingreso bruto: ' + D(I) + ' → todo va al Pozo (día no oficial: sin meta, sin ahorro y sin cuota)');
      } else if (tipo === 'novedad') {
        r.meta = M;
        const comRef = kmRef * ref.costoKm(f);
        r.combustibleReferencia = comRef;
        r.sugerido = Math.max(0, M - comRef);
        const sAh = Math.min(S, A), sCuota = Math.max(0, S - sAh);
        r.cubre = { comb: 0, ahorro: sAh, cuota: sCuota };
        r.ahorro = sAh; r.ahorroCubierto = sAh; r.cuotaApoyo = sCuota; r.cuota = sCuota;
        r.faltante = Math.max(0, r.sugerido - S);
        r.difMeta = -M; r.metaConPozo = r.sugerido > 0 && r.faltante < 1;
        tz('🤒 Novedad: meta incumplida. El Pozo puede cubrir lo que un día normal habría dejado (opción A).');
        tz('   ' + D(M) + ' − combustible de referencia (' + N(kmRef) + ' km × ' + D(ref.costoKm(f)) + '/km = ' + D(comRef) + ') = ' + D(r.sugerido) + ' → ahorro ' + D(Math.min(A, r.sugerido)) + ' + cuota ' + D(Math.max(0, r.sugerido - A)));
        if (S > 0) tz('💧 Apoyo del Pozo confirmado ' + D(S) + ': ahorro ' + D(sAh) + ' · cuota ' + D(sCuota));
      } else {
        tz('😴 Descanso: sin ingresos, sin kilómetros y sin movimientos.');
      }

      // ---------- Alertas de la jornada ----------
      if (trabaja) {
        if (I == null) al('pendiente', 'Falta el ingreso de Uber');
        if (!tramos.length) al('pendiente', 'Faltan los kilómetros');
        tramos.forEach(t => {
          const o = t.original;
          if (esNum(o.kmIni) && esNum(o.kmFin) && o.kmFin < o.kmIni) al('inconsistente', 'Tramo ' + t.n + ': el trip final es menor que el inicial');
          else if (t.km == null) al('pendiente', 'Tramo ' + t.n + ': faltan los kilómetros');
          else if (t.km > 600) al('inconsistente', 'Tramo ' + t.n + ': ' + N(t.km) + ' km parece demasiado');
          if (!t.aireConocido) al('aproximado', 'Tramo ' + t.n + ': faltan las horas con y sin aire (se tomó mitad y mitad)');
          if (!t.intervalo) al('inconsistente', 'Tramo ' + t.n + ': no hay un tanque lleno anterior para asignarle intervalo');
          else if (t.auto && t.original.intervalo) al('inconsistente', 'Tramo ' + t.n + ': su intervalo ya no existe; se asignó ' + t.intervalo.nombre);
        });
        if (combEstado === 'estimado') al('aproximado', 'Combustible provisional: el intervalo aún no se cierra con un tanque lleno', true);
        if (horas > 18) al('inconsistente', N(horas) + ' horas en un día parece demasiado');
        if (I > 0 && km === 0 && tramos.length) al('inconsistente', 'Hay ingreso pero 0 km');
      } else if (tipo === 'descanso' && oficialDia) {
        al('aproximado', 'Es día oficial y está como descanso (si fue incapacidad o novedad, márcalo como novedad)');
      }
      if (tipo === 'oficial' && !oficialDia) al('aproximado', 'Es ' + DIAS[dow].toLowerCase() + ' y está como jornada oficial');
      if (tipo === 'excepcional' && oficialDia) al('aproximado', 'Es día oficial y está como excepcional (todo va al Pozo)');
      if (Sp > 0) al('pendiente', 'Apoyo del Pozo por confirmar: ' + D(Sp), true);
      if (r.faltante >= 1 && ((tipo === 'oficial' && I != null) || tipo === 'novedad')) al('pendiente', 'Faltan ' + D(r.faltante) + (tipo === 'novedad' ? ' que el Pozo puede cubrir' : ' para la meta; el Pozo puede ayudar'), Sp > 0);
      if (S > r.sugerido + 1) al('inconsistente', 'El apoyo confirmado (' + D(S) + ') supera lo que faltaba (' + D(r.sugerido) + ')');
      if (aps.length && !(tipo === 'oficial' || tipo === 'novedad')) al('inconsistente', 'Tiene apoyos del Pozo pero no es jornada oficial ni novedad');
      for (const a of r.alertas) if (!a.soloJornada || a.nivel === 'inconsistente') r.estado = peor(r.estado, a.nivel);
      if (combEstado === 'estimado' && r.estado === 'confirmado') r.estado = 'aproximado';

      // Valor del kilómetro: lo que deja cada km después de pagar la gasolina (antes de ahorro, cuota y Pozo).
      r.neto = trabaja && I != null ? I - F : null;
      r.netoKm = r.neto != null && km > 0 ? r.neto / km : null;
      r.netoHora = r.neto != null && horas > 0 ? r.neto / horas : null;
      r.combKm = trabaja && km > 0 ? F / km : null;
      r.fracAire = horasCon + horasSin > 0 ? horasCon / (horasCon + horasSin) : null;

      res.push(r); porFecha[f] = r;
    }

    // ---------- 6. Libro del Pozo (mes a mes; el saldo inicial de un mes lo puede fijar Edwin en el cierre) ----------
    const entradas = [];
    for (const r of res) if (r.excedente > 0) entradas.push({
      id: 'aporte-' + r.fecha, fecha: r.fecha, mes: mesDe(r.fecha), tipo: 'aporte', auto: true, jornada: r.fecha,
      concepto: r.tipo === 'excepcional' ? 'Ingreso del ' + r.dia.toLowerCase() + ' trabajado' : 'Excedente sobre la meta',
      valor: r.excedente, estado: r.ingreso != null ? 'confirmado' : 'pendiente'
    });
    for (const m of movs) entradas.push(Object.assign({}, m, { mes: m.mes || (m.fecha ? mesDe(m.fecha) : mesDe(hoyTxt)) }));
    const meses = new Set(entradas.map(e => e.mes));
    meses.add(mesDe(cfg.inicio)); meses.add(mesDe(hoyTxt));
    Object.keys(cfg.saldoInicialPozo || {}).forEach(m => meses.add(m));
    const lm = [...meses].sort();
    const pozoMeses = {};
    let saldo = 0;
    const ordTipo = { aporte: 0, apoyo: 1, gasto: 2 };
    for (let m = lm[0]; m <= lm[lm.length - 1]; m = sumarMes(m, 1)) {
      const fijo = cfg.saldoInicialPozo && esNum(cfg.saldoInicialPozo[m]);
      const cierreAnterior = saldo;
      const inicial = fijo ? cfg.saldoInicialPozo[m] : saldo;
      const lista = entradas.filter(e => e.mes === m).sort((a, b) => {
        const fa = a.fecha || '9999', fb = b.fecha || '9999';
        if (fa !== fb) return fa < fb ? -1 : 1;
        return (ordTipo[a.tipo] || 0) - (ordTipo[b.tipo] || 0);
      });
      saldo = inicial;
      let aportes = 0, apoyos = 0, gastos = 0, pendientes = 0, minimo = inicial;
      for (const e of lista) {
        if (e.estado === 'confirmado') {
          if (e.tipo === 'aporte') { saldo += e.valor; aportes += e.valor; }
          else { saldo -= e.valor; if (e.tipo === 'apoyo') apoyos += e.valor; else gastos += e.valor; }
        } else pendientes++;
        e.saldo = saldo; minimo = Math.min(minimo, saldo);
      }
      pozoMeses[m] = { mes: m, inicial, fijo, cierreAnterior, aportes, apoyos, gastos, final: saldo, movimientos: lista, pendientes, minimo };
    }
    const pozoSaldo = saldo;

    // ---------- 7. Revisión (auditoría) ----------
    const auditoria = [];
    const A_ = (nivel, texto, ir) => auditoria.push({ nivel, texto, ir });
    for (const r of res) for (const a of r.alertas) if (!a.soloJornada) A_(a.nivel, fmt.fecha(r.fecha) + ': ' + a.texto, '#/jornada/' + r.fecha);
    for (let f = cfg.inicio; f <= hoyTxt; f = sumarDias(f, 1)) if (!porFecha[f]) {
      A_('pendiente', fmt.fecha(f) + (f === hoyTxt ? ': hoy aún no registras la jornada' : ': día sin registro'), '#/jornada/' + f);
    }
    for (const it of intervalos) {
      if (!it.cerrado) A_('pendiente', 'Intervalo ' + it.nombre + ' abierto (' + N(it.km) + ' km): se cierra con el próximo tanque lleno', '#/tanqueos');
      else if (!it.valido) A_('pendiente', 'Intervalo ' + it.nombre + ': faltan galones, valor o kilómetros', '#/tanqueo/' + it.fin.id);
      else if (it.rendimiento < 20 || it.rendimiento > 70) A_('inconsistente', 'Intervalo ' + it.nombre + ': ' + N(it.rendimiento) + ' km/galón no parece normal (revisa galones, km o si el tanque quedó lleno)', '#/tanqueo/' + it.fin.id);
      else if (it.aproximado) A_('aproximado', 'Intervalo ' + it.nombre + ': galones o valor aproximados', '#/tanqueo/' + it.fin.id);
    }
    for (const t of tq) if (t.estado === 'pendiente') A_('pendiente', 'Tanqueo ' + t.letra + ': datos pendientes', '#/tanqueo/' + t.id);
    for (const m of movs) {
      if (m.estado !== 'confirmado') A_('pendiente', 'Pozo: «' + m.concepto + '» de ' + D(m.valor) + (m.jornada ? ' (' + fmt.fecha(m.jornada) + ')' : '') + ' por confirmar', m.tipo === 'gasto' ? '#/gasto/' + m.id : '#/pozo');
      if (!m.fecha && m.tipo === 'gasto') A_('pendiente', 'Pozo: «' + m.concepto + '» sin fecha', '#/gasto/' + m.id);
    }
    for (const m in pozoMeses) if (pozoMeses[m].minimo < -0.5) A_('inconsistente', 'El Pozo quedó en negativo en ' + fmt.mes(m), '#/pozo');
    if (!ref.real) A_('aproximado', 'Rendimiento estimado (' + N(cfg.rendimientoConAire) + ' km/galón con aire) hasta cerrar el primer intervalo', '#/tanqueos');
    if (!cfg.ultimoRespaldo) A_('pendiente', 'Aún no has creado un respaldo de tus datos', '#/respaldo');
    else if ((fechaDe(hoyTxt) - fechaDe(cfg.ultimoRespaldo.slice(0, 10))) / 864e5 > 7) A_('pendiente', 'Tu último respaldo tiene más de 7 días', '#/respaldo');
    auditoria.sort((a, b) => NIVEL[b.nivel] - NIVEL[a.nivel]);

    // ---------- 8. Resumen de un mes (para Inicio, Informes, Cuota y Ahorro) ----------
    const memo = {};
    function resumenMes(mes) {
      if (memo[mes]) return memo[mes];
      const n = diasDelMes(mes), primero = mes + '-01', ultimo = mes + '-' + String(n).padStart(2, '0');
      const corte = hoyTxt < ultimo ? hoyTxt : ultimo;
      const filas = [];
      for (let f = primero; f <= corte; f = sumarDias(f, 1)) {
        if (f < cfg.inicio) continue;
        filas.push(porFecha[f] || { fecha: f, pendiente: true, dia: DIAS[diaSemana(f)], diaCorto: DIAS_CORTOS[diaSemana(f)], oficialDia: cfg.diasOficiales.includes(diaSemana(f)), estado: 'pendiente', tipo: 'sin registro' });
      }
      const dm = res.filter(r => mesDe(r.fecha) === mes);
      const s = campo => dm.reduce((a, r) => a + (esNum(r[campo]) ? r[campo] : 0), 0);
      const trab = dm.filter(r => r.trabaja);
      const conMeta = dm.filter(r => r.tipo === 'oficial' || r.tipo === 'novedad');
      let oficialesMes = 0, oficialesRestantes = 0;
      for (let f = primero; f <= ultimo; f = sumarDias(f, 1)) {
        if (f < cfg.inicio || !cfg.diasOficiales.includes(diaSemana(f))) continue;
        oficialesMes++;
        if (f >= hoyTxt && !porFecha[f]) oficialesRestantes++;
      }
      const cuotaMeta = vigente(cfg.cuotaMensual, primero);
      const cuotaTotal = s('cuota');
      const promCuota = conMeta.length ? cuotaTotal / conMeta.length : 0;
      const horas = s('horas'), km = s('km'), ingreso = s('ingreso');
      const pagado = tq.filter(t => mesDe(t.fecha) === mes && esNum(t.valor)).reduce((a, t) => a + t.valor, 0);
      const out = {
        mes, filas, jornadas: dm, trabajadas: trab.length, oficialesMes, oficialesRestantes,
        ingreso, km, horas, horasCon: s('horasCon'), horasSin: s('horasSin'),
        combustible: s('combustible'), ahorro: s('ahorro'), ahorroSinCubrir: s('ahorroSinCubrir'),
        excedente: s('excedente'), apoyo: s('apoyo'), cuota: cuotaTotal, cuotaOperativa: s('cuotaOperativa'), cuotaApoyo: s('cuotaApoyo'),
        cuotaMeta, cuotaPct: cuotaMeta ? cuotaTotal / cuotaMeta : 0, cuotaPendiente: Math.max(0, cuotaMeta - cuotaTotal),
        cuotaProyeccion: cuotaTotal + promCuota * oficialesRestantes, promCuota,
        jornadasMeta: conMeta.length,
        metaCumplidas: dm.filter(r => r.tipo === 'oficial' && r.metaCumplida).length,
        metaConPozo: dm.filter(r => r.metaConPozo).length,
        novedades: dm.filter(r => r.tipo === 'novedad').length,
        pagado,
        ingresoKm: km > 0 ? trab.reduce((a, r) => a + (r.ingreso || 0), 0) / km : null,
        ingresoHora: horas > 0 ? trab.reduce((a, r) => a + (r.ingreso || 0), 0) / horas : null,
        deIngreso: {
          comb: dm.reduce((a, r) => a + r.deIngreso.comb, 0),
          ahorro: dm.reduce((a, r) => a + r.deIngreso.ahorro, 0),
          cuota: dm.reduce((a, r) => a + r.deIngreso.cuota, 0)
        },
        pozo: pozoMeses[mes] || null
      };
      memo[mes] = out;
      return out;
    }

    return {
      hoy: hoyTxt, cfg, ref, intervalos, tanqueos: tq, jornadas: res, porFecha, pozoMeses, pozoSaldo, movimientos: movs,
      auditoria, resumenMes, precio, intervaloPorFecha,
      ahorroTotal: res.reduce((a, r) => a + r.ahorro, 0),
      siguienteLetra: letraDe(tq.length ? Math.max(...tq.map(t => letraANum(t.letra))) + 1 : 0)
    };
  }

  // Resumen del valor del km de un grupo de días (promedio PONDERADO: total neto ÷ total km, no promedio de promedios).
  function estadKm(lista) {
    const d = lista.filter(r => r.trabaja && r.ingreso != null && r.km > 0);
    const s = (c, l = d) => l.reduce((a, r) => a + (r[c] || 0), 0);
    const km = s('km'), ingreso = s('ingreso'), comb = s('combustible'), neto = ingreso - comb;
    const conH = d.filter(r => r.horas > 0), horas = s('horas', conH), netoH = s('neto', conH);
    return {
      dias: d.length, km, ingreso, comb, neto, horas,
      brutoKm: km > 0 ? ingreso / km : null, combKm: km > 0 ? comb / km : null, netoKm: km > 0 ? neto / km : null,
      netoHora: horas > 0 ? netoH / horas : null, kmDia: d.length ? km / d.length : null,
      provisional: d.some(r => r.combEstado === 'estimado')
    };
  }

  function letraANum(l) { let n = 0; for (const c of String(l || 'A')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; }

  const Calc = { calcular, estadKm, vigente, fmt, CONFIG_INICIAL, DIAS, DIAS_CORTOS, MESES, NIVEL, hoy, fechaDe, aTexto, diaSemana, sumarDias, mesDe, sumarMes, diasDelMes, letraDe, esNum };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc; else raiz.Calc = Calc;
})(typeof self !== 'undefined' ? self : this);

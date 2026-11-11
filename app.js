// Mi Balance — PANTALLAS Y NAVEGACIÓN (11-11-2026).
// Las cuentas las hace calc.js; aquí solo se muestran, se capturan los datos y se guardan en el teléfono (db.js).
(function () {
  'use strict';
  const F = Calc.fmt, $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clonar = o => JSON.parse(JSON.stringify(o));
  const nuevoId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esNum = Calc.esNum;
  const TIPOS = { oficial: ['🚗', 'Oficial'], excepcional: ['⭐', 'Excepcional'], descanso: ['😴', 'Descanso'], novedad: ['🤒', 'Novedad'], 'sin registro': ['❔', 'Sin registro'] };
  const AYUDA_TIPO = {
    oficial: 'Día de trabajo normal: se descuenta combustible y ahorro; lo que pase de la meta va al Pozo.',
    excepcional: 'Martes o domingo trabajado: todo el ingreso va al Pozo (sin meta, sin ahorro, sin cuota).',
    descanso: 'No se trabajó: cero ingresos y cero kilómetros.',
    novedad: 'Día oficial sin trabajar (incapacidad u otra novedad): meta incumplida; el Pozo puede cubrir lo que un día normal habría dejado.'
  };
  let D = null, C = null, swReg = null;
  let mesVista = Calc.mesDe(Calc.hoy()), ultimaRuta = '';
  const ACC = {};

  // ---------------------------------------------------------------- utilidades
  function leerDinero(s) { const d = String(s == null ? '' : s).replace(/[^\d]/g, ''); return d ? parseInt(d, 10) : null; }
  function leerDecimal(s) {
    let t = String(s == null ? '' : s).trim().replace(/\s/g, '');
    if (!t) return null;
    if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(',', '.');
    const n = parseFloat(t);
    return isFinite(n) ? n : null;
  }
  const verDinero = v => (esNum(v) ? F.num(v, 0) : '');
  const verDecimal = v => (esNum(v) ? F.num(v, 2) : '');
  const ln = (t, v, cls = '') => `<div class="ln ${cls}"><span>${t}</span><b>${v}</b></div>`;
  const NOMBRE_ESTADO = { confirmado: 'Confirmado', aproximado: 'Aproximado', estimado: 'Provisional', pendiente: 'Pendiente', inconsistente: 'Revisar', real: 'Real' };
  const etiqueta = est => `<span class="etiqueta e-${est === 'real' ? 'confirmado' : est}">${NOMBRE_ESTADO[est] || esc(est)}</span>`;

  function tarjeta(et, val, sub, ir, extra = '', clase = '') {
    const destino = ir.startsWith('!') ? `data-accion="${ir.slice(1)}"` : `data-ir="${ir}"`;
    return `<button class="tarjeta ${clase}" ${destino}><span class="t-et">${et}</span><span class="t-val">${val}</span>${extra}${sub ? `<span class="t-sub">${sub}</span>` : ''}</button>`;
  }
  function selectorMes() {
    return `<div class="mesbar"><button class="btn sec chico" style="min-width:60px;font-size:1.5rem" data-accion="mes" data-d="-1" aria-label="Mes anterior">‹</button><b>${F.mes(mesVista)}</b><button class="btn sec chico" style="min-width:60px;font-size:1.5rem" data-accion="mes" data-d="1" aria-label="Mes siguiente">›</button></div>`;
  }
  ACC.mes = el => { mesVista = Calc.sumarMes(mesVista, +el.dataset.d); pintar(); };

  let tTimer;
  function toast(msg, error) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'ver' + (error ? ' error' : '');
    clearTimeout(tTimer); tTimer = setTimeout(() => { t.className = error ? 'error' : ''; }, error ? 4000 : 2600);
  }

  // Ventana de confirmación. botones: [{texto, clase, leer(hoja) → valor | false (no cierra)}]. Devuelve {i, v}.
  function modal(titulo, cuerpo, botones) {
    return new Promise(ok => {
      const h = $('#modalHoja'), m = $('#modal');
      h.innerHTML = `<h2>${esc(titulo)}</h2><div>${cuerpo}</div><div class="botones">${botones.map((b, i) => `<button class="btn ${b.clase || 'sec'}" data-mb="${i}">${esc(b.texto)}</button>`).join('')}</div>`;
      m.classList.add('ver');
      const primero = h.querySelector('input'); if (primero) setTimeout(() => primero.focus(), 50);
      h.querySelectorAll('input[data-tipo="dinero"]').forEach(inp => inp.addEventListener('input', () => { inp.value = verDinero(leerDinero(inp.value)); }));
      const cerrar = (i, v) => { m.classList.remove('ver'); m.onclick = null; ok({ i, v }); };
      m.onclick = e => {
        const b = e.target.closest('[data-mb]');
        if (b) { const i = +b.dataset.mb, bt = botones[i]; const v = bt.leer ? bt.leer(h) : true; if (v === false) return; cerrar(i, v); }
        else if (e.target === m) cerrar(-1);
      };
    });
  }
  async function confirmar(titulo, texto, si = 'Sí', clase = 'prim') {
    const r = await modal(titulo, `<p>${texto}</p>`, [{ texto: si, clase }, { texto: 'Cancelar' }]);
    return r.i === 0;
  }
  const avisar = (titulo, html) => modal(titulo, html, [{ texto: 'Entendido', clase: 'prim' }]);

  // ---------------------------------------------------------------- guardar
  function recalcular() {
    C = Calc.calcular(D, Calc.hoy());
    const n = C.auditoria.filter(a => a.nivel !== 'aproximado').length;
    $('#campana').innerHTML = n ? `🔔<sup style="font-size:.65rem;font-weight:800;color:var(--aviso)">${n}</sup>` : '✅';
  }
  function enMemoria(c) {
    if (c.tienda === 'config') { D.config = clonar(c.dato); return; }
    const lista = D[c.tienda], key = c.tienda === 'jornadas' ? 'fecha' : 'id';
    if (c.borrar !== undefined) { const i = lista.findIndex(x => x[key] === c.borrar); if (i >= 0) lista.splice(i, 1); return; }
    const i = lista.findIndex(x => x[key] === c.dato[key]);
    if (i >= 0) lista[i] = clonar(c.dato); else lista.push(clonar(c.dato));
  }
  async function guardar(cambios, msg) {
    const antes = C;
    try { await DB.aplicar(cambios); }
    catch (e) { toast('❌ No se pudo guardar: ' + (e && e.message), true); throw e; }
    cambios.forEach(enMemoria);
    recalcular();
    if (msg) toast(msg);
    return antes;
  }
  // Después de guardar: si cambió el resultado de OTROS días, se le muestra a Edwin qué cambió.
  function avisarCambios(antes, excluir) {
    const l = [];
    for (const r of C.jornadas) {
      if (r.fecha === excluir) continue;
      const a = antes.porFecha[r.fecha]; if (!a) continue;
      const dq = Math.round(r.combustible) !== Math.round(a.combustible), dc = Math.round(r.cuota) !== Math.round(a.cuota), dp = Math.round(r.excedente) !== Math.round(a.excedente);
      if (dq || dc || dp) l.push(`<div class="caja" style="margin:8px 0;padding:10px"><b>${F.fecha(r.fecha)}</b><div class="reparto">${dq ? ln('⛽ Combustible', F.dinero(a.combustible) + ' → ' + F.dinero(r.combustible)) : ''}${dc ? ln('🚗 Cuota', F.dinero(a.cuota) + ' → ' + F.dinero(r.cuota)) : ''}${dp ? ln('💧 Al Pozo', F.dinero(a.excedente) + ' → ' + F.dinero(r.excedente)) : ''}</div></div>`);
    }
    if (l.length) return avisar('Esto también cambió', `<p>Con este cambio se recalcularon ${l.length} ${l.length === 1 ? 'día' : 'días'}:</p>${l.join('')}<p class="peq suave">Saldo del Pozo: ${F.dinero(antes.pozoSaldo)} → ${F.dinero(C.pozoSaldo)}</p>`);
  }

  // ---------------------------------------------------------------- navegación
  const RUTAS = {
    inicio: vInicio, jornada: vJornada, tanqueos: vTanqueos, tanqueo: vTanqueo, pozo: vPozo, gasto: vGasto, ahorro: vAhorro,
    cuota: vCuota, informes: vInformes, km: vKm, mas: vMas, config: vConfig, respaldo: vRespaldo, auditoria: vAuditoria, ayuda: vAyuda
  };
  function pintar() {
    const h = location.hash.replace(/^#\/?/, '') || 'inicio';
    const p = h.split('/').map(decodeURIComponent), ruta = RUTAS[p[0]] ? p[0] : 'inicio';
    let v;
    try { v = RUTAS[ruta](...p.slice(1)); }
    catch (e) { console.error(e); v = { titulo: 'Error', html: `<div class="caja alerta">Algo falló al mostrar esta pantalla: ${esc(e.message)}</div><a class="btn sec" href="#/inicio">Volver al inicio</a>` }; }
    document.title = v.titulo === 'Mi Balance' ? 'Mi Balance' : v.titulo + ' · Mi Balance';
    $('#titulo').textContent = v.titulo;
    $('#atras').hidden = !v.atras;
    $('#vista').innerHTML = v.html;
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('activo', a.dataset.r === (v.nav || ruta)));
    if (h !== ultimaRuta) { window.scrollTo(0, 0); ultimaRuta = h; }
    if (v.despues) v.despues();
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-ir],[data-accion]');
    if (!el || el.closest('#modal')) return;
    if (el.dataset.ir) { e.preventDefault(); if (location.hash === el.dataset.ir) pintar(); else location.hash = el.dataset.ir; return; }
    const fn = ACC[el.dataset.accion];
    if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch(err => { console.error(err); toast('❌ ' + (err && err.message), true); }); }
  });

  // ---------------------------------------------------------------- gráficas (SVG propio, liviano)
  const GRAF = {};
  function grafica(id, titulo, puntos, op = {}) {
    GRAF[id] = puntos;
    if (!puntos.length) return `<div class="grafica"><h3>${titulo}</h3><p class="suave">Sin datos todavía.</p></div>`;
    const W = 340, H = 170, izq = 4, base = H - 20;
    const vals = puntos.map(p => p.v || 0).concat(op.linea != null ? [op.linea] : []);
    const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
    const n = puntos.length, ancho = (W - izq) / n, bw = Math.max(3, ancho * 0.72);
    const y = v => base - ((v - min) / (max - min || 1)) * (base - 12);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}"><line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" style="stroke:var(--linea)"/>`;
    const cada = Math.ceil(n / 16);
    puntos.forEach((p, i) => {
      const x0 = izq + i * ancho, x = x0 + (ancho - bw) / 2, y0 = y(0), y1 = y(p.v || 0);
      s += `<rect class="b" x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, Math.abs(y1 - y0)).toFixed(1)}" rx="2" style="fill:${p.color || 'var(--acento)'}"/>`;
      s += `<rect data-accion="barra" data-g="${id}" data-i="${i}" x="${x0.toFixed(1)}" y="0" width="${ancho.toFixed(1)}" height="${H}" style="fill:transparent;cursor:pointer"/>`;
      if (i % cada === 0) s += `<text x="${(x0 + ancho / 2).toFixed(1)}" y="${H - 5}" font-size="11" text-anchor="middle" style="fill:var(--suave)">${esc(p.et)}</text>`;
    });
    if (op.linea != null) s += `<line x1="0" x2="${W}" y1="${y(op.linea)}" y2="${y(op.linea)}" stroke-dasharray="5 4" style="stroke:var(--texto);opacity:.7"/><text x="${W - 2}" y="${y(op.linea) - 4}" font-size="11" text-anchor="end" style="fill:var(--texto)">${esc(op.lineaTxt || '')}</text>`;
    s += '</svg>';
    return `<div class="grafica"><h3>${titulo}</h3>${s}<div class="info" id="info-${id}"><span class="suave peq">Toca una barra para ver el dato</span></div></div>`;
  }
  ACC.barra = el => {
    const p = GRAF[el.dataset.g][+el.dataset.i];
    $('#info-' + el.dataset.g).innerHTML = `<span>${esc(p.txt)}</span>${p.ir ? `<a class="btn sec chico" href="${p.ir}">Ver ›</a>` : ''}`;
  };
  function colorDia(r) {
    if (r.tipo === 'excepcional') return 'var(--pozo)';
    if (r.tipo === 'oficial') return r.metaCumplida ? 'var(--bien)' : 'var(--mal)';
    return 'var(--suave)';
  }
  function grafIngresos(id, M) {
    const dias = M.filas.filter(r => !r.pendiente);
    const meta = Calc.vigente(C.cfg.metaDiaria, M.mes + '-01');
    return grafica(id, '💵 Ingresos diarios (verde = cumplió, rojo = no, azul = martes/domingo)', dias.map(r => ({
      et: String(+r.fecha.slice(8)), v: r.ingreso || 0, color: colorDia(r), ir: '#/jornada/' + r.fecha,
      txt: F.fecha(r.fecha) + ' · ' + F.dinero(r.ingreso || 0) + ' · ' + TIPOS[r.tipo][1]
    })), { linea: meta, lineaTxt: 'meta ' + F.dinero(meta) });
  }

  // ================================================================ INICIO
  function vInicio() {
    const M = C.resumenMes(mesVista), hoy = C.hoy, rh = C.porFecha[hoy], ref = C.ref;
    const pend = C.auditoria.filter(a => a.nivel !== 'aproximado').length;
    let h = selectorMes();
    if (!D.jornadas.length && !D.tanqueos.length && !D.pozo.length) h += `<div class="caja pozo"><h3 style="margin-top:0;color:var(--texto)">👋 Bienvenido a Mi Balance</h3><p>Si ya tienes un respaldo (por ejemplo, el de noviembre que te preparé), cárgalo y quedará todo como lo llevabas.</p><a class="btn btn-pozo" href="#/respaldo">📂 Cargar mi respaldo</a><p class="ayuda">Si prefieres empezar de cero, solo registra tu primera jornada y tu primer tanque lleno.</p></div>`;
    if (mesVista === Calc.mesDe(hoy)) h += `<a class="btn prim" href="#/jornada/${hoy}" style="min-height:72px;font-size:1.2rem">${rh ? '✏️ Ver la jornada de hoy' : '➕ Registrar la jornada de hoy'}</a>`;
    if (pend) h += `<button class="aviso-banda" data-ir="#/auditoria"><span style="font-size:1.5rem">⚠️</span><span>${pend} ${pend === 1 ? 'cosa' : 'cosas'} por completar o revisar</span><span style="margin-left:auto">›</span></button>`;
    const pct = Math.min(100, M.cuotaPct * 100);
    h += '<div class="tarjetas" style="margin-top:12px">';
    h += tarjeta('🚗 Fondo de la cuota', `<span class="c-cuota">${F.dinero(M.cuota)}</span> <span class="peq suave">de ${F.dinero(M.cuotaMeta)}</span>`,
      `${F.num(M.cuotaPct * 100)} % · operación ${F.dinero(M.cuotaOperativa)} · apoyos del Pozo ${F.dinero(M.cuotaApoyo)} · proyección del mes ${F.dinero(M.cuotaProyeccion)}`,
      '#/cuota', `<div class="barra-p"><i style="width:${pct}%"></i></div>`, 'ancha');
    h += tarjeta('💧 Pozo de Eficiencia', `<span class="c-pozo">${F.dinero(C.pozoSaldo)}</span>`, 'saldo actual' + (M.pozo && M.pozo.pendientes ? ` · ${M.pozo.pendientes} por confirmar` : ''), '#/pozo');
    h += tarjeta('🐷 Ahorro obligatorio', `<span class="c-ahorro">${F.dinero(M.ahorro)}</span>`, `${M.jornadas.filter(r => r.ahorro > 0).length} jornadas` + (M.ahorroSinCubrir >= 1 ? ` · ${F.dinero(M.ahorroSinCubrir)} sin cubrir` : ''), '#/ahorro');
    h += tarjeta('💵 Ingreso bruto Uber', F.dinero(M.ingreso), `${M.trabajadas} días trabajados`, '#/informes/1');
    h += tarjeta('🛣️ Kilómetros', F.num(M.km) + ' km', M.trabajadas ? `promedio ${F.num(M.km / M.trabajadas)} km por día` : '', '#/informes/1');
    h += tarjeta('🎯 Meta cumplida', `${M.metaCumplidas} de ${M.jornadasMeta}`, M.metaConPozo ? `+${M.metaConPozo} completadas con el Pozo` : 'jornadas oficiales y novedades', '#/informes/1/meta');
    const K = Calc.estadKm(M.jornadas);
    h += tarjeta('🛣️ Valor de tu km', K.netoKm != null ? `<span class="bien">${F.dinero(K.netoKm)}</span><span class="peq suave">/km</span>` : '—', K.netoKm != null ? `neto de gasolina · bruto ${F.dinero(K.brutoKm)}/km · ${F.dinero(K.netoHora)}/h` : 'aún sin jornadas', '#/km');
    h += tarjeta('⛽ Combustible pagado', `<span class="c-comb">${F.dinero(M.pagado)}</span>`, `asignado a las jornadas: ${F.dinero(M.combustible)}`, '#/tanqueos');
    h += tarjeta('📈 Rendimiento real', F.num(ref.rendimiento) + ' km/gal' + (ref.real ? '' : '*'),
      ref.real ? (ref.mejor && ref.mejor !== ref.peor ? `mejor ${ref.mejor.nombre}: ${F.num(ref.mejor.rendimiento)} · menor ${ref.peor.nombre}: ${F.num(ref.peor.rendimiento)}` : 'km totales ÷ galones totales') : '*estimado: aún no hay intervalos cerrados', '#/informes/3');
    h += tarjeta('💲 Costo por km', ref.costoKmReal != null ? F.dinero(ref.costoKmReal) : '—', `presupuestado ${F.dinero(ref.presupuestado(hoy))} con ${F.num(C.cfg.rendimientoConAire)} km/gal`, '#/informes/3');
    h += '</div>';
    h += grafIngresos('gInicio', M);
    h += `<h2>Accesos rápidos</h2><div class="botones tres">
      <a class="btn sec atajo" href="#/tanqueo/nuevo"><span class="ic">⛽</span>Registrar tanqueo</a>
      <a class="btn sec atajo" href="#/gasto/nuevo"><span class="ic">🧽</span>Gasto del Pozo</a>
      <button class="btn sec atajo" data-accion="respaldo"><span class="ic">💾</span>Crear respaldo</button>
      <a class="btn sec atajo" href="#/informes/2"><span class="ic">📊</span>Ver balance</a>
      <a class="btn sec atajo" href="#/informes/1"><span class="ic">📅</span>Día a día</a>
      <a class="btn sec atajo" href="#/auditoria"><span class="ic">🔍</span>Por revisar</a></div>`;
    return { titulo: 'Mi Balance', html: h, nav: 'inicio' };
  }

  // ================================================================ JORNADA (registro diario)
  let B = null, Bfecha = null;   // borrador en pantalla y fecha guardada que se está editando
  function vJornada(fecha) {
    fecha = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : C.hoy;
    const ex = D.jornadas.find(j => j.fecha === fecha);
    B = ex ? clonar(ex) : jornadaNueva(fecha);
    if (!B.tramos) B.tramos = [];
    Bfecha = ex ? fecha : null;
    return { titulo: ex ? 'Jornada · ' + F.fecha(fecha) : 'Registrar jornada', atras: true, nav: 'jornada', html: '<div id="fj"></div><div id="jPozo"></div>', despues: pintarFormJornada };
  }
  function jornadaNueva(fecha) {
    const of = C.cfg.diasOficiales.includes(Calc.diaSemana(fecha));
    return { fecha, tipo: of ? 'oficial' : 'excepcional', ingreso: null, obs: '', tramos: [tramoNuevo(fecha)] };
  }
  function tramoNuevo(fecha) {
    const it = C.intervaloPorFecha(fecha);
    return { kmIni: 0, kmFin: null, horasCon: null, horasSin: null, intervalo: it ? it.id : null };
  }
  function pintarFormJornada() {
    const f = B.fecha, dow = Calc.diaSemana(f), of = C.cfg.diasOficiales.includes(dow);
    const trabaja = B.tipo === 'oficial' || B.tipo === 'excepcional';
    let h = '<form id="formJ" autocomplete="off" novalidate>';
    h += `<div class="campo"><label for="jFecha">Fecha</label><div class="fila-fecha"><button type="button" class="btn sec" data-accion="jDia" data-d="-1" aria-label="Día anterior">‹</button><input type="date" id="jFecha" value="${f}" max="${C.hoy}"><button type="button" class="btn sec" data-accion="jDia" data-d="1" aria-label="Día siguiente">›</button></div><div class="ayuda"><b>${Calc.DIAS[dow]}</b> · ${of ? 'día oficial de trabajo' : 'día no oficial'}</div></div>`;
    if (Bfecha) h += '<p class="peq suave">✏️ Esta jornada ya está guardada: si cambias algo y guardas, se reemplaza.</p>';
    h += `<div class="campo"><span class="etq">Tipo de jornada</span><div class="chips">${['oficial', 'excepcional', 'descanso', 'novedad'].map(t => `<button type="button" class="chip ${B.tipo === t ? 'on' : ''}" data-accion="jTipo" data-t="${t}">${TIPOS[t][0]} ${TIPOS[t][1]}</button>`).join('')}</div><div class="ayuda">${AYUDA_TIPO[B.tipo]}</div></div>`;
    if (trabaja) {
      h += `<div class="campo"><label for="jIng">💵 Ingreso bruto de Uber</label><input id="jIng" class="grande" inputmode="numeric" placeholder="$ 0" value="${verDinero(B.ingreso)}"></div>`;
      B.tramos.forEach((t, i) => { h += htmlTramo(t, i); });
      h += '<button type="button" class="btn sec" data-accion="jTramo">➕ Agregar tramo (tanqueé en medio de la jornada)</button>';
      h += '<p class="ayuda">Horas: si dejas una de las dos vacías, se toma como 0.</p>';
    }
    h += `<div class="campo"><label for="jObs">📝 Observaciones</label><textarea id="jObs" placeholder="Opcional">${esc(B.obs || '')}</textarea></div>`;
    h += '<div id="jPrev"></div>';
    h += `<div class="botones"><button type="submit" class="btn prim" style="min-height:68px;font-size:1.2rem">💾 Guardar jornada</button>${Bfecha ? '<button type="button" class="btn peligro" data-accion="jBorrar">🗑️ Eliminar esta jornada</button>' : ''}</div></form>`;
    $('#fj').innerHTML = h;
    const form = $('#formJ');
    form.addEventListener('input', alEscribirJornada);
    form.addEventListener('change', e => { if (!form.isConnected) return; if (e.target.id === 'jFecha') cambiarFechaJornada(e.target.value); else alEscribirJornada(e); });
    form.addEventListener('submit', e => { e.preventDefault(); guardarJornada().catch(err => console.error(err)); });
    pintarPrevia();
  }
  function htmlTramo(t, i) {
    const opts = C.intervalos.map(it => `<option value="${it.id}" ${t.intervalo === it.id ? 'selected' : ''}>${esc(it.nombre)} · ${it.cerrado ? 'cerrado' : 'abierto'} · desde ${F.fecha(it.inicio.fecha)}</option>`).join('');
    const km = esNum(t.kmIni) && esNum(t.kmFin) ? t.kmFin - t.kmIni : null;
    const varios = B.tramos.length > 1;
    return `<fieldset class="tramo"><legend>Tramo ${i + 1}${varios ? (i === 0 ? ' · antes del tanqueo' : ' · después del tanqueo') : ''}</legend>
      <label class="etq" for="t${i}int">⛽ Intervalo de combustible</label>
      <select id="t${i}int" data-t="${i}" data-c="intervalo">${opts || '<option value="">Aún no hay tanqueos registrados</option>'}</select>
      <div class="dos" style="margin-top:10px"><div><label class="etq" for="t${i}ini">Trip inicial</label><input id="t${i}ini" data-t="${i}" data-c="kmIni" inputmode="decimal" value="${verDecimal(t.kmIni)}"></div>
      <div><label class="etq" for="t${i}fin">Trip final</label><input id="t${i}fin" data-t="${i}" data-c="kmFin" inputmode="decimal" placeholder="km" value="${verDecimal(t.kmFin)}"></div></div>
      <div class="ayuda" id="t${i}km">${km != null ? '= <b>' + F.num(km) + ' km</b> recorridos' : 'Escribe el trip final'}</div>
      <div class="dos" style="margin-top:10px"><div><label class="etq" for="t${i}con">❄️ Horas con aire</label><input id="t${i}con" data-t="${i}" data-c="horasCon" inputmode="decimal" placeholder="0" value="${verDecimal(t.horasCon)}"></div>
      <div><label class="etq" for="t${i}sin">🌬️ Horas sin aire</label><input id="t${i}sin" data-t="${i}" data-c="horasSin" inputmode="decimal" placeholder="0" value="${verDecimal(t.horasSin)}"></div></div>
      <div class="ayuda" id="t${i}h">${textoHoras(t)}</div>
      ${i > 0 ? `<button type="button" class="btn peligro chico" style="margin-top:10px" data-accion="jQuitarTramo" data-t="${i}">Quitar este tramo</button>` : ''}
    </fieldset>`;
  }
  function textoHoras(t) {
    const c = esNum(t.horasCon) ? t.horasCon : null, s = esNum(t.horasSin) ? t.horasSin : null;
    if (c == null && s == null) return 'Sin horas: el combustible se calcula como mitad con aire y mitad sin aire';
    return 'Total: <b>' + F.num((c || 0) + (s || 0)) + ' h</b>';
  }
  function alEscribirJornada(e) {
    // Al guardar se vuelve a dibujar el formulario y el navegador avisa «cambio» de la casilla vieja: se ignora.
    if (e.currentTarget && !e.currentTarget.isConnected) return;
    const el = e.target;
    if (el.id === 'jIng') { B.ingreso = leerDinero(el.value); if (e.type === 'input') el.value = verDinero(B.ingreso); }
    else if (el.id === 'jObs') B.obs = el.value;
    else if (el.dataset.t != null && el.dataset.c) {
      const i = +el.dataset.t, t = B.tramos[i], c = el.dataset.c;
      t[c] = c === 'intervalo' ? el.value || null : leerDecimal(el.value);
      if (c === 'kmIni' || c === 'kmFin') {
        const km = esNum(t.kmIni) && esNum(t.kmFin) ? t.kmFin - t.kmIni : null;
        $('#t' + i + 'km').innerHTML = km == null ? 'Escribe el trip final' : km < 0 ? '<span class="mal">⚠️ El trip final es menor que el inicial</span>' : '= <b>' + F.num(km) + ' km</b> recorridos';
      }
      if (c === 'horasCon' || c === 'horasSin') $('#t' + i + 'h').innerHTML = textoHoras(t);
    } else return;
    B._sucio = true;
    pintarPrevia();
  }
  function cambiarFechaJornada(nf) {
    if (!nf) return;
    if (nf > C.hoy) { toast('No se pueden registrar días que aún no pasan', true); $('#jFecha').value = B.fecha; return; }
    if (Bfecha || D.jornadas.some(j => j.fecha === nf)) { location.hash = '#/jornada/' + nf; return; }
    // Borrador nuevo: lo escrito se lleva a la otra fecha.
    B.fecha = nf;
    if (!B._tipoManual) {
      const of = C.cfg.diasOficiales.includes(Calc.diaSemana(nf));
      B.tipo = of ? 'oficial' : 'excepcional';
    }
    if (B.tramos.length === 1 && !B._sucio) B.tramos = [tramoNuevo(nf)];
    history.replaceState(null, '', '#/jornada/' + nf); ultimaRuta = 'jornada/' + nf;
    pintarFormJornada();
  }
  ACC.jDia = el => {
    const nf = Calc.sumarDias(B.fecha, +el.dataset.d);
    if (nf > C.hoy) return toast('Ese día todavía no ha pasado', true);
    cambiarFechaJornada(nf);
  };
  ACC.jTipo = el => {
    B.tipo = el.dataset.t; B._sucio = true; B._tipoManual = true;
    if ((B.tipo === 'oficial' || B.tipo === 'excepcional') && !B.tramos.length) B.tramos = [tramoNuevo(B.fecha)];
    pintarFormJornada();
  };
  ACC.jTramo = () => {
    const ints = C.intervalos, ult = B.tramos[B.tramos.length - 1];
    const idx = ints.findIndex(i => i.id === (ult && ult.intervalo));
    const t = tramoNuevo(B.fecha);
    if (B.tramos.length === 1 && idx > 0 && ints[idx].inicio.fecha === B.fecha && idx === ints.length - 1) {
      // El tanqueo de hoy ya está registrado: el primer tramo va al intervalo anterior y el nuevo al de hoy.
      B.tramos[0].intervalo = ints[idx - 1].id; t.intervalo = ints[idx].id;
    } else if (idx >= 0 && idx < ints.length - 1) t.intervalo = ints[idx + 1].id;
    else if (ult) t.intervalo = ult.intervalo;
    B.tramos.push(t); B._sucio = true;
    pintarFormJornada();
    if (!ints.length || t.intervalo === (ult && ult.intervalo)) toast('Recuerda registrar el tanqueo para elegir el intervalo nuevo');
  };
  ACC.jQuitarTramo = el => { B.tramos.splice(+el.dataset.t, 1); B._sucio = true; pintarFormJornada(); };

  function limpiarJornada(b) {
    const trabaja = b.tipo === 'oficial' || b.tipo === 'excepcional';
    const j = { fecha: b.fecha, tipo: b.tipo, ingreso: trabaja ? b.ingreso : null, obs: (b.obs || '').trim(), tramos: [] };
    if (trabaja) j.tramos = (b.tramos || []).map(t => {
      const x = { kmIni: t.kmIni, kmFin: t.kmFin, horasCon: t.horasCon, horasSin: t.horasSin, intervalo: t.intervalo || null };
      if (esNum(x.horasCon) && !esNum(x.horasSin)) x.horasSin = 0;
      if (esNum(x.horasSin) && !esNum(x.horasCon)) x.horasCon = 0;
      return x;
    });
    if (b.creado) j.creado = b.creado;
    return j;
  }
  function simularJornada() {
    const j = limpiarJornada(B);
    const D2 = Object.assign({}, D, { jornadas: D.jornadas.filter(x => x.fecha !== j.fecha && x.fecha !== Bfecha).concat([j]) });
    return Calc.calcular(D2, C.hoy).porFecha[j.fecha];
  }
  function pintarPrevia() {
    const guardada = Bfecha && !B._sucio;
    $('#jPrev').innerHTML = htmlReparto(guardada ? C.porFecha[B.fecha] : simularJornada(), !guardada);
    $('#jPozo').innerHTML = guardada ? htmlApoyo(C.porFecha[B.fecha]) : '';
  }
  function etqComb(e) { return e === 'real' ? '' : ' ' + etiqueta(e); }
  function htmlReparto(r, previa) {
    if (!r) return '';
    let h = `<div class="caja"><h3 style="margin-top:0;color:var(--texto)">${previa ? '👀 Así se reparte (aún sin guardar)' : '📋 Así quedó repartido'}</h3><div class="reparto">`;
    if (r.tipo === 'oficial') {
      h += ln('💵 Ingreso bruto', F.dinero(r.ingreso));
      h += ln('🎯 Meta del día', F.dinero(r.meta));
      h += ln(`⛽ Combustible (${F.num(r.km)} km)${etqComb(r.combEstado)}`, `<span class="c-comb">−${F.dinero(r.combustible)}</span>`);
      h += ln('🐷 Ahorro obligatorio', `<span class="c-ahorro">−${F.dinero(r.ahorro)}</span>`);
      h += ln('🚗 Para la cuota (operación)', `<span class="c-cuota">${F.dinero(r.cuotaOperativa)}</span>`);
      if (r.excedente > 0) h += ln('💧 Al Pozo (lo que pasó de la meta)', `<span class="c-pozo">+${F.dinero(r.excedente)}</span>`);
      if (r.apoyo > 0) h += ln('💧 Apoyo del Pozo (traslado interno)', `<span class="c-pozo">${F.dinero(r.apoyo)}</span>`) + ln('🚗 Total para la cuota', `<span class="c-cuota">${F.dinero(r.cuota)}</span>`, 'tot');
      if (r.ingreso != null) h += ln(r.difMeta >= 0 ? '✅ Meta cumplida' : '📉 Faltó para la meta', `<span class="${r.difMeta >= 0 ? 'bien' : 'mal'}">${r.difMeta >= 0 ? '+' : ''}${F.dinero(r.difMeta)}</span>`);
      if (r.combSinCubrir >= 1 || r.ahorroSinCubrir >= 1) h += ln('⚠️ Sin cubrir (combustible + ahorro)', `<span class="mal">${F.dinero(r.combSinCubrir + r.ahorroSinCubrir)}</span>`);
    } else if (r.tipo === 'excepcional') {
      h += ln('💵 Ingreso bruto', F.dinero(r.ingreso));
      h += ln('💧 Todo va al Pozo', `<span class="c-pozo">+${F.dinero(r.excedente)}</span>`, 'tot');
      h += ln(`⛽ Combustible (solo control, ${F.num(r.km)} km)${etqComb(r.combEstado)}`, `<span class="c-comb">${F.dinero(r.combustible)}</span>`);
    } else if (r.tipo === 'novedad') {
      h += ln('🎯 Meta del día', `<span class="mal">Incumplida</span>`);
      h += ln('💧 El Pozo puede cubrir', F.dinero(r.sugerido));
      h += ln('💧 Apoyo confirmado', `<span class="c-pozo">${F.dinero(r.apoyo)}</span>`);
      h += ln('🐷 Ahorro (con el Pozo)', `<span class="c-ahorro">${F.dinero(r.ahorro)}</span>`);
      h += ln('🚗 Para la cuota (con el Pozo)', `<span class="c-cuota">${F.dinero(r.cuota)}</span>`, 'tot');
    } else {
      h += ln('😴 Descanso', 'Sin ingresos ni kilómetros');
    }
    if (r.trabaja) {
      h += ln('⚡ Ingreso por km · por hora', (r.ingresoKm != null ? F.dinero(r.ingresoKm) : '—') + ' · ' + (r.ingresoHora != null ? F.dinero(r.ingresoHora) : '—'));
      h += ln(`🛣️ Frente a ${F.num(r.kmRef)} km de referencia`, (r.difKm >= 0 ? '+' : '') + F.num(r.difKm) + ' km');
      if (r.tramos.length > 1) r.tramos.forEach(t => { h += ln(`Tramo ${t.n} · ${t.intervalo ? esc(t.intervalo.nombre) : 'sin intervalo'}`, `${F.num(t.km)} km · ${F.dinero(t.costo)}`); });
    }
    h += '</div>';
    if (r.alertas.length) h += r.alertas.map(a => `<p class="peq">${etiqueta(a.nivel)} ${esc(a.texto)}</p>`).join('');
    h += `<details class="traza"><summary>🔍 ¿Cómo se calculó?</summary>${r.traza.map(t => `<div>${esc(t)}</div>`).join('')}</details></div>`;
    return h;
  }
  function htmlApoyo(r) {
    if (!r || !(r.tipo === 'oficial' || r.tipo === 'novedad')) return '';
    const pend = r.apoyos.filter(m => m.estado !== 'confirmado'), conf = r.apoyos.filter(m => m.estado === 'confirmado');
    const falta = r.faltante - pend.reduce((s, m) => s + m.valor, 0);
    if (!pend.length && !conf.length && falta < 1) return '';
    let h = `<div class="caja pozo"><h3 style="margin-top:0" class="c-pozo">💧 Pozo de Eficiencia</h3><p>Saldo disponible: <b>${F.dinero(C.pozoSaldo)}</b></p>`;
    for (const m of pend) h += `<div class="caja"><p><b>Apoyo pendiente: ${F.dinero(m.valor)}</b></p><p class="peq suave">${esc(m.justificacion || '')}</p><div class="botones dos"><button class="btn btn-pozo" data-accion="apoyoConfirmar" data-id="${m.id}">✔ Confirmar</button><button class="btn peligro" data-accion="apoyoQuitar" data-id="${m.id}">✖ Descartar</button></div></div>`;
    for (const m of conf) h += `<div class="reparto"><div class="ln"><span>✔ Apoyo confirmado <b>${F.dinero(m.valor)}</b></span><button class="btn sec chico" data-accion="apoyoQuitar" data-id="${m.id}">Deshacer</button></div></div>`;
    if (falta >= 1) {
      h += `<p>${r.tipo === 'novedad' ? 'El Pozo puede cubrir' : 'Faltan'} <b>${F.dinero(falta)}</b>${r.tipo === 'novedad' ? ' (ahorro + cuota de un día normal).' : ' para completar la meta (primero combustible, luego ahorro y luego cuota).'}</p>`;
      if (C.pozoSaldo >= 1) {
        h += `<button class="btn btn-pozo" data-accion="apoyoPedir" data-f="${r.fecha}">💧 Pasar del Pozo ${F.dinero(Math.min(falta, C.pozoSaldo))}</button>`;
        if (C.pozoSaldo < falta) h += `<p class="peq aviso">El saldo no alcanza: quedarían ${F.dinero(falta - C.pozoSaldo)} sin cubrir.</p>`;
      } else h += `<p class="mal">El Pozo no tiene saldo: quedan ${F.dinero(falta)} sin cubrir.</p>`;
    }
    return h + '</div>';
  }

  async function guardarJornada() {
    const j = limpiarJornada(B);
    if (j.fecha > C.hoy) return toast('No se pueden registrar días que aún no pasan', true);
    for (let i = 0; i < j.tramos.length; i++) {
      const t = j.tramos[i];
      if (esNum(t.kmIni) && esNum(t.kmFin) && t.kmFin < t.kmIni) return toast(`Tramo ${i + 1}: el trip final es menor que el inicial`, true);
      if ((esNum(t.horasCon) && t.horasCon < 0) || (esNum(t.horasSin) && t.horasSin < 0)) return toast(`Tramo ${i + 1}: las horas no pueden ser negativas`, true);
    }
    const trabaja = j.tipo === 'oficial' || j.tipo === 'excepcional';
    if (trabaja && j.ingreso == null && !(await confirmar('¿Guardar sin ingreso?', 'La jornada quedará pendiente hasta que escribas el ingreso de Uber.', 'Sí, guardar'))) return;
    if (trabaja && j.tramos.some(t => !esNum(t.kmFin)) && !(await confirmar('¿Guardar sin kilómetros?', 'Falta el trip final: el combustible quedará pendiente.', 'Sí, guardar'))) return;
    const ex = D.jornadas.find(x => x.fecha === j.fecha);
    if (ex && Bfecha !== j.fecha && !(await confirmar('Ya hay una jornada ese día', 'Si sigues, se reemplaza la jornada guardada del ' + F.fecha(j.fecha) + '.', 'Reemplazar', 'peligro'))) return;
    const cambios = [];
    const aps = D.pozo.filter(m => m.tipo === 'apoyo' && m.jornada === j.fecha);
    if (aps.length && !(j.tipo === 'oficial' || j.tipo === 'novedad')) {
      if (!(await confirmar('Esta jornada tiene apoyos del Pozo', `Como ${TIPOS[j.tipo][1].toLowerCase()} no puede recibir apoyos: se quitan ${aps.length} (${F.dinero(aps.reduce((s, m) => s + m.valor, 0))}).`, 'Sí, quitarlos', 'peligro'))) return;
      aps.forEach(m => cambios.push({ tienda: 'pozo', borrar: m.id }));
    }
    const ahora = new Date().toISOString();
    j.creado = (ex && ex.creado) || j.creado || ahora; j.editado = ahora;
    cambios.push({ tienda: 'jornadas', dato: j });
    const antes = await guardar(cambios, '✅ Jornada guardada');
    if (location.hash !== '#/jornada/' + j.fecha) location.hash = '#/jornada/' + j.fecha; else pintar();
    await avisarCambios(antes, j.fecha);
    const r = C.porFecha[j.fecha];
    if (r && r.faltante >= 1 && !r.apoyoPendiente) setTimeout(() => { const b = $('#jPozo'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 150);
  }
  ACC.jBorrar = async () => {
    const f = Bfecha, aps = D.pozo.filter(m => m.tipo === 'apoyo' && m.jornada === f);
    if (!(await confirmar('¿Eliminar la jornada?', `Se borra la jornada del <b>${F.fechaLarga(f)}</b>${aps.length ? ` y sus ${aps.length} apoyo(s) del Pozo` : ''}. Los demás días no se tocan.`, '🗑️ Sí, eliminar', 'peligro'))) return;
    const antes = await guardar([{ tienda: 'jornadas', borrar: f }].concat(aps.map(m => ({ tienda: 'pozo', borrar: m.id }))), '🗑️ Jornada eliminada');
    location.hash = '#/informes/1';
    await avisarCambios(antes, f);
  };

  // ---- Apoyos del Pozo
  ACC.apoyoPedir = async el => {
    const r = C.porFecha[el.dataset.f];
    const pendV = r.apoyos.filter(m => m.estado !== 'confirmado').reduce((s, m) => s + m.valor, 0);
    const max = Math.round(Math.min(r.faltante - pendV, C.pozoSaldo));
    if (max < 1) return toast('No hay saldo o no falta nada', true);
    const res = await modal('💧 Apoyo del Pozo', `<p>¿Cuánto pasas del Pozo a la jornada del <b>${F.fecha(r.fecha)}</b>?</p>
      <input id="mValor" class="grande" inputmode="numeric" data-tipo="dinero" value="${verDinero(max)}">
      <p class="ayuda">Máximo ${F.dinero(max)}. Es un traslado interno: no cuenta como ingreso de Uber.</p>
      <p class="peq">Saldo del Pozo: ${F.dinero(C.pozoSaldo)}</p>`,
      [{ texto: '✔ Confirmar apoyo', clase: 'btn-pozo', leer: h => { const v = leerDinero(h.querySelector('#mValor').value); if (!v || v > max) { toast('Escribe un valor entre $1 y ' + F.dinero(max), true); return false; } return v; } }, { texto: 'Cancelar' }]);
    if (res.i !== 0) return;
    const mov = { id: nuevoId('p-'), tipo: 'apoyo', fecha: r.fecha, mes: Calc.mesDe(r.fecha), jornada: r.fecha, concepto: 'Apoyo a la meta', valor: res.v, estado: 'confirmado',
      justificacion: r.tipo === 'novedad' ? 'Novedad: cubre ahorro y cuota del día' : 'Completar la meta del día', creado: new Date().toISOString() };
    await guardar([{ tienda: 'pozo', dato: mov }], '✅ Apoyo del Pozo registrado');
    pintar();
  };
  ACC.apoyoConfirmar = async el => {
    const m = D.pozo.find(x => x.id === el.dataset.id); if (!m) return;
    if (m.valor > C.pozoSaldo + 0.5) return avisar('Saldo insuficiente', `<p>El Pozo tiene ${F.dinero(C.pozoSaldo)} y este movimiento es de ${F.dinero(m.valor)}. El Pozo no puede quedar en negativo.</p>`);
    const r = m.jornada ? C.porFecha[m.jornada] : null;
    const extra = r && m.tipo === 'apoyo' && m.valor > r.faltante + 1 ? `<p class="aviso">Ojo: hoy ese día solo necesita ${F.dinero(r.faltante)}.</p>` : '';
    if (!(await confirmar('¿Confirmar el movimiento?', `Salen <b>${F.dinero(m.valor)}</b> del Pozo${m.jornada ? ' para la jornada del ' + F.fecha(m.jornada) : ''}. El saldo queda en ${F.dinero(C.pozoSaldo - m.valor)}.${extra}`, '✔ Sí, confirmar', 'btn-pozo'))) return;
    await guardar([{ tienda: 'pozo', dato: Object.assign({}, m, { estado: 'confirmado', confirmado: new Date().toISOString() }) }], '✅ Confirmado');
    pintar();
  };
  ACC.apoyoQuitar = async el => {
    const m = D.pozo.find(x => x.id === el.dataset.id); if (!m) return;
    if (!(await confirmar('¿Quitar este movimiento?', `Se quita «${esc(m.concepto)}» de ${F.dinero(m.valor)}${m.estado === 'confirmado' ? ' y el dinero vuelve al saldo del Pozo' : ''}.`, 'Sí, quitar', 'peligro'))) return;
    await guardar([{ tienda: 'pozo', borrar: m.id }], 'Movimiento quitado');
    pintar();
  };

  // ================================================================ TANQUEOS
  function htmlIntervalo(it) {
    const est = !it.cerrado || !it.valido ? 'pendiente' : it.aproximado ? 'aproximado' : 'confirmado';
    const estTxt = !it.cerrado ? 'Abierto' : !it.valido ? 'Faltan datos' : it.aproximado ? 'Cerrado · aproximado' : 'Cerrado';
    return `<details class="item"><summary style="list-style:none;cursor:pointer"><div class="arriba"><b>⛽ ${esc(it.nombre)}</b><span class="etiqueta e-${est}">${estTxt}</span></div>
      <div class="datos"><span>${F.fecha(it.inicio.fecha)} → ${it.fin ? F.fecha(it.fin.fecha) : 'sigue abierto'}</span><span><b>${F.num(it.km)}</b> km</span>
      ${it.valido ? `<span><b>${F.num(it.galones, 2)}</b> gal</span><span><b>${F.num(it.rendimiento, 2)}</b> km/gal</span><span><b>${F.dinero(it.costoKm)}</b>/km</span><span>pagado <b>${F.dinero(it.valor)}</b></span>`
        : `<span>costo provisional <b>${F.dinero(it.costoKmEstimado)}</b>/km</span>`}</div><div class="peq suave" style="margin-top:4px">Toca para ver los tramos ▾</div></summary>
      <div style="margin-top:8px">${it.tramos.map(x => `<a class="btn sec chico" style="width:100%;justify-content:space-between;margin:4px 0" href="#/jornada/${x.fecha}"><span>${F.fecha(x.fecha)} · tramo ${x.tramo.n}</span><span>${F.num(x.tramo.km)} km · ${F.dinero(x.tramo.costo)}</span></a>`).join('') || '<p class="suave peq">Sin kilómetros todavía.</p>'}</div></details>`;
  }
  function vTanqueos() {
    const ref = C.ref, hoy = C.hoy;
    let h = '<a class="btn prim" href="#/tanqueo/nuevo">⛽ Registrar tanqueo</a><div class="tarjetas" style="margin-top:12px">';
    h += tarjeta('📈 Rendimiento real', ref.real ? F.num(ref.rendimiento, 2) + ' km/gal' : '—', ref.real ? `${F.num(ref.km)} km ÷ ${F.num(ref.galones, 2)} galones` : 'se calcula al cerrar el primer intervalo', '#/informes/3');
    h += tarjeta('💲 Costo real por km', ref.costoKmReal != null ? F.dinero(ref.costoKmReal) : '—', `presupuestado ${F.dinero(ref.presupuestado(hoy))} · galón ${F.dinero(C.precio(hoy))}`, '#/informes/3');
    h += '</div><p class="ayuda">Cada tanque <b>lleno</b> cierra el intervalo anterior y abre uno nuevo. Si tanqueas a mitad de jornada, en la jornada agrega un segundo tramo con el intervalo nuevo.</p>';
    h += '<h2>Intervalos</h2><div class="lista">' + (C.intervalos.slice().reverse().map(htmlIntervalo).join('') || '<p class="suave">Aún no hay tanques llenos registrados.</p>') + '</div>';
    h += '<h2>Tanqueos</h2><div class="lista">' + C.tanqueos.slice().reverse().map(t => `<button class="item" data-ir="#/tanqueo/${t.id}"><div class="arriba"><b>Tanqueo ${esc(t.letra)} · ${F.fecha(t.fecha)}${t.hora ? ' · ' + esc(t.hora) : ''}</b><span class="valor">${F.dinero(t.valor)}</span></div><div class="datos"><span>${esNum(t.galones) ? '<b>' + F.num(t.galones, 2) + '</b> gal' : 'galones —'}</span>${esNum(t.galones) && esNum(t.valor) ? `<span><b>${F.dinero(t.valor / t.galones)}</b>/gal</span>` : ''}<span>${t.lleno ? '🟢 Lleno' : '🟡 Parcial'}</span>${etiqueta(t.estado || 'confirmado')}</div></button>`).join('') + '</div>';
    return { titulo: 'Tanqueos', html: h, nav: 'mas' };
  }
  let TQ = null;
  function vTanqueo(id) {
    const ex = id && id !== 'nuevo' ? D.tanqueos.find(t => t.id === id) : null;
    if (id && id !== 'nuevo' && !ex) return { titulo: 'Tanqueo', atras: true, html: '<p>Ese tanqueo no existe.</p>' };
    const t = ex ? clonar(ex) : { id: nuevoId('t'), letra: C.siguienteLetra, orden: Date.now(), fecha: C.hoy, hora: '', valor: null, galones: null, lleno: true, estado: 'confirmado', obs: '' };
    TQ = t;
    const abierto = C.intervalos.filter(i => !i.cerrado).pop();
    const chips = (c, ops) => `<div class="chips" data-grupo="${c}">${ops.map(([v, txt]) => `<button type="button" class="chip ${String(t[c]) === String(v) ? 'on' : ''}" data-accion="tqOp" data-c="${c}" data-v="${v}">${txt}</button>`).join('')}</div>`;
    let h = `<form id="formT" autocomplete="off" novalidate><p class="suave">${ex ? '' : 'Este será el tanqueo <b>' + esc(t.letra) + '</b>.'}</p>
      <div class="dos"><div class="campo"><label for="qFecha">Fecha</label><input type="date" id="qFecha" value="${t.fecha}" max="${C.hoy}"></div>
      <div class="campo"><label for="qHora">Hora (opcional)</label><input type="time" id="qHora" value="${esc(t.hora || '')}"></div></div>
      <div class="campo"><label for="qValor">💵 Valor pagado</label><input id="qValor" class="grande" inputmode="numeric" placeholder="$ 0" value="${verDinero(t.valor)}"></div>
      <div class="campo"><label for="qGal">Galones cargados</label><input id="qGal" inputmode="decimal" placeholder="Ej: 7,8" value="${verDecimal(t.galones)}"><div class="ayuda" id="qPrecio"></div></div>
      <div class="campo"><span class="etq">¿Llenaste el tanque?</span>${chips('lleno', [[true, '🟢 Sí, lleno'], [false, '🟡 No, parcial']])}<div class="ayuda">Solo un tanque lleno cierra el intervalo y permite medir el rendimiento real.</div></div>
      <div class="campo"><span class="etq">Estado de los datos</span>${chips('estado', [['confirmado', 'Confirmado'], ['aproximado', 'Aproximado'], ['pendiente', 'Pendiente']])}<div class="ayuda">Si los galones no son exactos, márcalo como aproximado.</div></div>
      <div class="campo"><label for="qObs">📝 Observaciones</label><textarea id="qObs">${esc(t.obs || '')}</textarea></div>
      ${!ex && abierto ? `<div class="caja"><p class="peq">Si es tanque lleno, se cierra el intervalo <b>${esc(abierto.nombre.replace('…', t.letra))}</b> (${F.num(abierto.km)} km hasta ahora) y se abre <b>${esc(t.letra)} → …</b>.</p></div>` : ''}
      <div class="botones"><button type="submit" class="btn prim" style="min-height:66px">💾 Guardar tanqueo</button>${ex ? '<button type="button" class="btn peligro" data-accion="tqBorrar">🗑️ Eliminar tanqueo</button>' : ''}</div></form>`;
    return {
      titulo: ex ? 'Tanqueo ' + ex.letra : 'Registrar tanqueo', atras: true, nav: 'mas', html: h,
      despues: () => {
        const f = $('#formT');
        const precio = () => { const v = leerDinero($('#qValor').value), g = leerDecimal($('#qGal').value); $('#qPrecio').innerHTML = v && g ? `Precio por galón: <b>${F.dinero(v / g)}</b> (configurado: ${F.dinero(C.precio($('#qFecha').value || C.hoy))})` : ''; };
        f.addEventListener('input', e => { if (e.target.id === 'qValor') e.target.value = verDinero(leerDinero(e.target.value)); precio(); });
        f.addEventListener('submit', e => { e.preventDefault(); guardarTanqueo().catch(err => console.error(err)); });
        precio();
      }
    };
  }
  ACC.tqOp = el => {
    const c = el.dataset.c, v = el.dataset.v;
    TQ[c] = c === 'lleno' ? v === 'true' : v;
    el.parentElement.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === el));
  };
  async function guardarTanqueo() {
    const t = TQ;
    t.fecha = $('#qFecha').value; t.hora = $('#qHora').value || null;
    t.valor = leerDinero($('#qValor').value); t.galones = leerDecimal($('#qGal').value); t.obs = $('#qObs').value.trim();
    if (!t.fecha) return toast('Falta la fecha', true);
    if (t.fecha > C.hoy) return toast('No se pueden registrar días que aún no pasan', true);
    if (esNum(t.galones) && (t.galones <= 0 || t.galones > 20)) return toast('Revisa los galones: ' + F.num(t.galones, 2) + ' no parece posible', true);
    const primero = !D.tanqueos.length || (D.tanqueos.length === 1 && D.tanqueos[0].id === t.id);
    if (!primero && (t.valor == null || t.galones == null)) {
      if (!(await confirmar('Faltan datos', 'Sin valor o sin galones el intervalo que cierra este tanqueo quedará pendiente. ¿Guardar así?', 'Sí, guardar'))) return;
      if (t.estado === 'confirmado') t.estado = 'pendiente';
    }
    const ex = D.tanqueos.find(x => x.id === t.id);
    t.creado = (ex && ex.creado) || new Date().toISOString(); t.editado = new Date().toISOString();
    const antes = await guardar([{ tienda: 'tanqueos', dato: t }], '✅ Tanqueo guardado');
    const it = C.intervalos.find(i => i.fin && i.fin.id === t.id);
    location.hash = '#/tanqueos';
    if (it && it.valido) await avisar('Intervalo ' + it.nombre + ' cerrado', `<div class="reparto">${ln('🛣️ Kilómetros', F.num(it.km) + ' km')}${ln('⛽ Galones', F.num(it.galones, 2))}${ln('📈 Rendimiento', F.num(it.rendimiento, 2) + ' km/gal')}${ln('💲 Costo por km', F.dinero(it.costoKm))}${ln('💵 Pagado', F.dinero(it.valor))}</div><p class="peq suave">Las jornadas de este intervalo ya tienen su combustible real.</p>`);
    await avisarCambios(antes, null);
  }
  ACC.tqBorrar = async () => {
    const t = TQ, usan = D.jornadas.reduce((n, j) => n + (j.tramos || []).filter(x => x.intervalo === t.id).length, 0);
    if (!(await confirmar('¿Eliminar el tanqueo ' + t.letra + '?', 'Se recalculan los intervalos.' + (usan ? ` <b>${usan} tramo(s)</b> de jornadas usan el intervalo que abre este tanqueo: quedarán marcados para revisar.` : ''), '🗑️ Sí, eliminar', 'peligro'))) return;
    const antes = await guardar([{ tienda: 'tanqueos', borrar: t.id }], '🗑️ Tanqueo eliminado');
    location.hash = '#/tanqueos';
    await avisarCambios(antes, null);
  };

  // ================================================================ POZO
  let filtroPozo = new Set();
  function vPozo() {
    const P = C.pozoMeses[mesVista];
    let h = selectorMes();
    h += `<div class="caja pozo" style="text-align:center"><div class="suave">Saldo actual del Pozo</div><div class="c-pozo num" style="font-size:2.5rem;font-weight:800">${F.dinero(C.pozoSaldo)}</div><div class="peq suave">Saldo inicial + aportes confirmados − apoyos y gastos confirmados</div></div>`;
    h += '<a class="btn prim" href="#/gasto/nuevo">🧽 Registrar gasto del Pozo</a>';
    if (!P) return { titulo: 'Pozo de Eficiencia', html: h + '<p class="suave">Sin movimientos en este mes.</p>', nav: 'pozo' };
    const dif = P.fijo && Math.abs(P.inicial - P.cierreAnterior) >= 1 && mesVista > Object.keys(C.pozoMeses).sort()[0];
    h += '<div class="tarjetas" style="margin-top:12px">';
    h += tarjeta('🏁 Arrancó el mes con', F.dinero(P.inicial), (P.fijo ? 'fijado por ti' : 'viene del mes anterior') + (dif ? ` (el mes anterior cerró en ${F.dinero(P.cierreAnterior)})` : '') + ' · toca para cambiar', '!pozoInicial');
    h += tarjeta('➕ Aportes', `<span class="bien">+${F.dinero(P.aportes)}</span>`, 'excedentes y martes/domingos', '!pozoFiltro" data-v="aporte');
    const menos = v => (v >= 1 ? `<span class="mal">−${F.dinero(v)}</span>` : F.dinero(0));
    h += tarjeta('🎯 Apoyos a metas', menos(P.apoyos), 'traslados a jornadas', '!pozoFiltro" data-v="apoyo');
    h += tarjeta('🧽 Gastos del vehículo', menos(P.gastos), 'lavado, mantenimiento…', '!pozoFiltro" data-v="gasto');
    h += tarjeta('🏁 Cierre del mes', F.dinero(P.final), P.pendientes ? `${P.pendientes} movimiento(s) sin confirmar` : 'todo confirmado', '!pozoFiltro" data-v="pendiente');
    h += '</div>';
    const pend = P.movimientos.filter(m => m.estado !== 'confirmado' && !m.auto);
    if (pend.length) {
      h += `<h2>⏳ Por confirmar (${pend.length})</h2><p class="ayuda">No se descuentan hasta que los confirmes.</p>`;
      h += pend.map(m => `<div class="caja alerta"><div class="arriba" style="display:flex;justify-content:space-between;gap:8px"><b>${esc(m.concepto)}${m.jornada ? ' · ' + F.fecha(m.jornada) : ''}</b><b class="num">${F.dinero(m.valor)}</b></div><p class="peq suave">${esc(m.justificacion || '')}</p><div class="botones dos"><button class="btn btn-pozo" data-accion="apoyoConfirmar" data-id="${m.id}">✔ Confirmar</button><button class="btn peligro" data-accion="apoyoQuitar" data-id="${m.id}">✖ Descartar</button></div></div>`).join('');
    }
    const TIPOP = { aporte: '➕ Aporte', apoyo: '🎯 Apoyo a meta', gasto: '🧽 Gasto' };
    const ver = P.movimientos.filter(m => !filtroPozo.size || filtroPozo.has(m.tipo) || (filtroPozo.has('pendiente') && m.estado !== 'confirmado'));
    h += `<h2>Movimientos de ${F.mes(mesVista)}</h2><div class="chips" style="margin-bottom:10px">${[['aporte', 'Aportes'], ['apoyo', 'Apoyos'], ['gasto', 'Gastos'], ['pendiente', 'Por confirmar']].map(([v, t]) => `<button class="chip mini ${filtroPozo.has(v) ? 'on' : ''}" data-accion="pozoFiltro" data-v="${v}" data-suma="1">${t}</button>`).join('')}${filtroPozo.size ? '<button class="chip mini" data-accion="pozoFiltro" data-v="">✕ Quitar filtro</button>' : ''}</div><div class="lista">`;
    h += ver.map(m => {
      const signo = m.tipo === 'aporte' ? '+' : '−', ir = m.tipo === 'gasto' ? '#/gasto/' + m.id : '#/jornada/' + m.jornada;
      return `<button class="item ${m.estado !== 'confirmado' ? 'pend' : ''}" data-ir="${ir}"><div class="arriba"><b>${m.fecha ? F.fecha(m.fecha) : 'Sin fecha'} · ${esc(m.concepto)}</b><span class="valor ${m.tipo === 'aporte' ? 'bien' : 'mal'}">${signo}${F.dinero(m.valor)}</span></div><div class="datos"><span>${TIPOP[m.tipo] || m.tipo}</span>${etiqueta(m.estado)}<span>saldo después: <b>${F.dinero(m.saldo)}</b></span>${m.justificacion ? `<span>${esc(m.justificacion)}</span>` : ''}</div></button>`;
    }).join('') || '<p class="suave">Nada con ese filtro.</p>';
    h += '</div>';
    const gastos = P.movimientos.filter(m => m.tipo === 'gasto' && m.estado === 'confirmado');
    if (gastos.length) {
      const porC = {}; gastos.forEach(g => { porC[g.concepto] = (porC[g.concepto] || 0) + g.valor; });
      h += '<h2>🧽 Gastos del vehículo por concepto</h2><div class="caja"><div class="reparto">' + Object.entries(porC).sort((a, b) => b[1] - a[1]).map(([c, v]) => ln(esc(c), F.dinero(v))).join('') + ln('Total', F.dinero(P.gastos), 'tot') + '</div></div>';
    }
    return { titulo: 'Pozo de Eficiencia', html: h, nav: 'pozo' };
  }
  ACC.pozoFiltro = el => {
    const v = el.dataset.v;
    if (!v) filtroPozo.clear();
    else if (el.dataset.suma) { if (filtroPozo.has(v)) filtroPozo.delete(v); else filtroPozo.add(v); }
    else filtroPozo = new Set([v]);
    pintar();
    if (!el.dataset.suma && v) setTimeout(() => { const t = [...document.querySelectorAll('h2')].find(x => x.textContent.startsWith('Movimientos')); if (t) t.scrollIntoView({ behavior: 'smooth' }); }, 50);
  };
  ACC.pozoInicial = async () => {
    const P = C.pozoMeses[mesVista];
    const res = await modal('🏁 Saldo inicial del Pozo', `<p>¿Con cuánto arrancó el Pozo en <b>${F.mes(mesVista)}</b>?</p><input id="mValor" class="grande" inputmode="numeric" data-tipo="dinero" value="${verDinero(P.inicial)}"><p class="ayuda">Si no lo fijas, se toma el cierre del mes anterior${P.fijo ? '' : ' (' + F.dinero(P.cierreAnterior) + ')'}.</p>`,
      [{ texto: '💾 Guardar', clase: 'prim', leer: h => { const v = leerDinero(h.querySelector('#mValor').value); return v == null ? 0 : v; } }, { texto: 'Usar el cierre del mes anterior', clase: 'sec' }, { texto: 'Cancelar' }]);
    if (res.i < 0 || res.i === 2) return;
    const cfg = clonar(D.config); cfg.saldoInicialPozo = cfg.saldoInicialPozo || {};
    if (res.i === 0) cfg.saldoInicialPozo[mesVista] = res.v; else delete cfg.saldoInicialPozo[mesVista];
    await guardar([{ tienda: 'config', dato: cfg }], '✅ Saldo inicial guardado');
    pintar();
  };

  let GS = null;
  function vGasto(id) {
    const ex = id && id !== 'nuevo' ? D.pozo.find(m => m.id === id && m.tipo === 'gasto') : null;
    if (id && id !== 'nuevo' && !ex) return { titulo: 'Gasto', atras: true, html: '<p>Ese gasto no existe.</p>' };
    const g = ex ? clonar(ex) : { id: nuevoId('g-'), tipo: 'gasto', fecha: C.hoy, mes: Calc.mesDe(C.hoy), concepto: '', valor: null, justificacion: '', estado: 'confirmado' };
    GS = g;
    const conceptos = ['Lavado de chasis', 'Mantenimiento', 'Reparación', 'Llantas', 'Otro gasto del carro'];
    let h = `<form id="formG" autocomplete="off" novalidate>
      <div class="campo"><label for="gFecha">📅 Fecha del gasto</label><input type="date" id="gFecha" value="${g.fecha || ''}" max="${C.hoy}">
        <div class="ayuda" id="gFechaAyuda">${g.fecha ? '' : '⏳ Aún sin fecha: toca la casilla de arriba y elige el día.'}</div>
        <label class="ayuda" style="display:flex;align-items:center;gap:10px;min-height:48px"><input type="checkbox" id="gSinFecha" style="width:26px;min-height:26px" ${g.fecha ? '' : 'checked'}> No sé la fecha exacta (queda pendiente)</label></div>
      <div class="campo"><span class="etq">Concepto</span><div class="chips">${conceptos.map(c => `<button type="button" class="chip mini ${g.concepto === c ? 'on' : ''}" data-accion="gsConcepto" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <input id="gConcepto" style="margin-top:8px" placeholder="O escribe el concepto" value="${esc(g.concepto)}"></div>
      <div class="campo"><label for="gValor">💵 Valor</label><input id="gValor" class="grande" inputmode="numeric" placeholder="$ 0" value="${verDinero(g.valor)}"></div>
      <div class="campo"><label for="gJust">Justificación</label><textarea id="gJust" placeholder="¿Por qué se pagó con el Pozo?">${esc(g.justificacion || '')}</textarea></div>
      <div class="campo"><span class="etq">Estado</span><div class="chips">${[['confirmado', '✔ Confirmado (ya se pagó)'], ['pendiente', '⏳ Pendiente']].map(([v, t]) => `<button type="button" class="chip ${g.estado === v ? 'on' : ''}" data-accion="gsEstado" data-v="${v}">${t}</button>`).join('')}</div><div class="ayuda">Los pendientes no se descuentan del saldo.</div></div>
      <p class="peq">Saldo actual del Pozo: <b>${F.dinero(C.pozoSaldo)}</b></p>
      <div class="botones"><button type="submit" class="btn prim" style="min-height:66px">💾 Guardar gasto</button>${ex ? '<button type="button" class="btn peligro" data-accion="gsBorrar">🗑️ Eliminar gasto</button>' : ''}</div></form>`;
    return {
      titulo: ex ? 'Gasto del Pozo' : 'Registrar gasto del Pozo', atras: true, nav: 'pozo', html: h,
      despues: () => {
        const f = $('#formG');
        f.addEventListener('input', e => { if (e.target.id === 'gValor') e.target.value = verDinero(leerDinero(e.target.value)); });
        // La casilla de fecha nunca se bloquea: al elegir un día se quita «No sé la fecha»; al marcarla se borra el día.
        $('#gFecha').addEventListener('input', e => { if (e.target.value) { $('#gSinFecha').checked = false; $('#gFechaAyuda').textContent = ''; } });
        $('#gSinFecha').addEventListener('change', e => { if (e.target.checked) { $('#gFecha').value = ''; $('#gFechaAyuda').textContent = '⏳ Quedará pendiente de fecha.'; } });
        f.addEventListener('submit', e => { e.preventDefault(); guardarGasto().catch(err => console.error(err)); });
      }
    };
  }
  ACC.gsConcepto = el => { $('#gConcepto').value = el.dataset.v; el.parentElement.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === el)); };
  ACC.gsEstado = el => { GS.estado = el.dataset.v; el.parentElement.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === el)); };
  async function guardarGasto() {
    const g = GS, ex = D.pozo.find(m => m.id === g.id);
    g.fecha = $('#gFecha').value || null;
    g.concepto = $('#gConcepto').value.trim(); g.valor = leerDinero($('#gValor').value); g.justificacion = $('#gJust').value.trim();
    if (g.fecha && g.fecha > C.hoy) return toast('No se pueden registrar días que aún no pasan', true);
    if (!g.concepto) return toast('Falta el concepto', true);
    if (!g.valor) return toast('Falta el valor', true);
    g.mes = g.fecha ? Calc.mesDe(g.fecha) : (ex && ex.mes) || mesVista;
    const disponible = C.pozoSaldo + (ex && ex.estado === 'confirmado' ? ex.valor : 0);
    if (g.estado === 'confirmado' && g.valor > disponible + 0.5) return avisar('El Pozo no alcanza', `<p>El saldo disponible es ${F.dinero(disponible)} y el gasto es de ${F.dinero(g.valor)}. El Pozo no puede quedar en negativo. Puedes guardarlo como pendiente.</p>`);
    g.creado = (ex && ex.creado) || new Date().toISOString(); g.editado = new Date().toISOString();
    await guardar([{ tienda: 'pozo', dato: g }], g.estado === 'confirmado' ? '✅ Gasto guardado y descontado' : '✅ Gasto guardado como pendiente');
    location.hash = '#/pozo';
  }
  ACC.gsBorrar = async () => {
    if (!(await confirmar('¿Eliminar el gasto?', `Se elimina «${esc(GS.concepto)}» de ${F.dinero(GS.valor)}${GS.estado === 'confirmado' ? ' y el dinero vuelve al saldo del Pozo' : ''}.`, '🗑️ Sí, eliminar', 'peligro'))) return;
    await guardar([{ tienda: 'pozo', borrar: GS.id }], '🗑️ Gasto eliminado');
    location.hash = '#/pozo';
  };

  // ================================================================ AHORRO y CUOTA
  function vAhorro() {
    const M = C.resumenMes(mesVista);
    const filas = M.jornadas.filter(r => r.tipo === 'oficial' || r.tipo === 'novedad');
    let h = selectorMes() + `<div class="caja" style="text-align:center"><div class="suave">Ahorro obligatorio de ${F.mes(mesVista)}</div><div class="c-ahorro num" style="font-size:2.5rem;font-weight:800">${F.dinero(M.ahorro)}</div>
      <div class="peq suave">${filas.filter(r => r.ahorro > 0).length} jornadas · total desde el inicio: <b>${F.dinero(C.ahorroTotal)}</b></div></div>`;
    if (M.ahorroSinCubrir >= 1) h += `<div class="caja alerta"><p>⚠️ <b>${F.dinero(M.ahorroSinCubrir)}</b> del ahorro no alcanzó a salir del ingreso del día. Se cubre con un apoyo del Pozo en la jornada.</p></div>`;
    h += '<p class="ayuda">Se separan ' + F.dinero(Calc.vigente(C.cfg.ahorroJornada, C.hoy)) + ' por cada jornada oficial trabajada (aunque el ingreso no llegue a la meta). Martes y domingos no generan ahorro. Es independiente del Pozo y de la cuota.</p>';
    h += '<h2>Historial</h2><div class="lista">' + filas.map(r => `<button class="item" data-ir="#/jornada/${r.fecha}"><div class="arriba"><b>${F.fecha(r.fecha)} · ${TIPOS[r.tipo][1]}</b><span class="valor c-ahorro">${F.dinero(r.ahorro)}</span></div><div class="datos"><span>del ingreso <b>${F.dinero(r.deIngreso.ahorro)}</b></span>${r.cubre.ahorro > 0 ? `<span>del Pozo <b>${F.dinero(r.cubre.ahorro)}</b></span>` : ''}${r.ahorroSinCubrir >= 1 ? `<span class="mal">sin cubrir <b>${F.dinero(r.ahorroSinCubrir)}</b></span>` : ''}</div></button>`).join('') + '</div>';
    if (!filas.length) h += '<p class="suave">Sin jornadas en este mes.</p>';
    return { titulo: 'Ahorro obligatorio', atras: true, nav: 'mas', html: h };
  }
  function vCuota() {
    const M = C.resumenMes(mesVista), pct = Math.min(100, M.cuotaPct * 100);
    let h = selectorMes() + `<div class="caja" style="text-align:center"><div class="suave">Fondo para la cuota del carro</div><div class="c-cuota num" style="font-size:2.5rem;font-weight:800">${F.dinero(M.cuota)}</div><div class="suave">de ${F.dinero(M.cuotaMeta)} · <b>${F.num(M.cuotaPct * 100)} %</b></div><div class="barra-p" style="height:18px"><i style="width:${pct}%"></i></div></div>`;
    h += '<div class="caja"><div class="reparto">';
    h += ln('🚗 De la operación (después de combustible y ahorro)', F.dinero(M.cuotaOperativa));
    h += ln('💧 Apoyos del Pozo confirmados', F.dinero(M.cuotaApoyo));
    h += ln('Total acumulado', F.dinero(M.cuota), 'tot');
    h += ln('⏳ Falta para la cuota', `<span class="${M.cuotaPendiente > 0 ? 'mal' : 'bien'}">${F.dinero(M.cuotaPendiente)}</span>`);
    h += ln(`📈 Proyección (${F.dinero(M.promCuota)} promedio × ${M.oficialesRestantes} jornadas que faltan)`, F.dinero(M.cuotaProyeccion));
    h += '</div></div><p class="ayuda">Al fondo solo llega lo que queda de los primeros ' + F.dinero(Calc.vigente(C.cfg.metaDiaria, C.hoy)) + ' después de combustible y ahorro, más los apoyos del Pozo que confirmes. Lo que pasa de la meta va al Pozo, no aquí.</p>';
    const filas = M.jornadas.filter(r => r.tipo === 'oficial' || r.tipo === 'novedad');
    h += '<h2>De dónde viene cada peso</h2><div class="lista">' + filas.map(r => `<button class="item" data-ir="#/jornada/${r.fecha}"><div class="arriba"><b>${F.fecha(r.fecha)} · ${TIPOS[r.tipo][1]}</b><span class="valor c-cuota">${F.dinero(r.cuota)}</span></div><div class="datos"><span>operación <b>${F.dinero(r.cuotaOperativa)}</b></span><span>Pozo <b>${F.dinero(r.cuotaApoyo)}</b></span>${r.apoyoPendiente ? `<span class="aviso">por confirmar <b>${F.dinero(r.apoyoPendiente)}</b></span>` : ''}${r.combEstado === 'estimado' ? '<span class="aviso">combustible provisional</span>' : ''}</div></button>`).join('') + '</div>';
    if (!filas.length) h += '<p class="suave">Sin jornadas en este mes.</p>';
    return { titulo: 'Cuota del carro', atras: true, nav: 'mas', html: h };
  }

  // ================================================================ INFORMES
  let filtroTipos = new Set();
  function vInformes(n = '1', extra) {
    n = String(n);
    if (n === '1' && extra === 'meta') filtroTipos = new Set(['oficial', 'novedad']);
    let h = selectorMes() + `<div class="tabs">${[['1', '📅 Día a día'], ['k', '🛣️ Mi km'], ['2', '📊 Acumulados'], ['3', '⛽ Combustible'], ['g', '📈 Gráficas']].map(([k, t]) => `<button class="chip ${n === k ? 'on' : ''}" data-ir="#/informes/${k}">${t}</button>`).join('')}</div>`;
    if (n === '1') h += informe1(); else if (n === 'k') h += informeKm(); else if (n === '2') h += informe2(); else if (n === '3') h += informe3(); else h += informeGraficas();
    return { titulo: n === 'k' ? 'Mi kilómetro' : n === '1' ? 'Día a día' : 'Informes', html: h, nav: n === 'k' ? 'km' : n === '1' ? 'dia' : 'mas' };
  }
  function vKm() { return vInformes('k'); }

  // ================================================================ MI KILÓMETRO (cuánto deja cada km después de la gasolina)
  function informeKm() {
    const M = C.resumenMes(mesVista), E = Calc.estadKm;
    const dias = M.jornadas.filter(r => r.trabaja && r.ingreso != null && r.km > 0);
    const mes = E(M.jornadas), total = E(C.jornadas), prev = E(C.resumenMes(Calc.sumarMes(mesVista, -1)).jornadas);
    let h = '<p class="ayuda">Valor neto del km = (ingreso de Uber − gasolina del día) ÷ km recorridos. Es lo que deja cada kilómetro antes de ahorro, cuota y Pozo. Los promedios son totales ÷ totales.</p>';
    if (!dias.length) return h + '<div class="caja"><p class="suave">Aún no hay jornadas con ingreso y kilómetros en este mes.</p></div>';
    const ult = dias[dias.length - 1], prom = mes.netoKm;
    const cmp = (a, b) => (b == null || a == null ? '' : `<span class="${a >= b ? 'bien' : 'mal'}">${a >= b ? '▲' : '▼'} ${F.dinero(Math.abs(a - b))}</span>`);
    h += '<div class="tarjetas">';
    h += tarjeta(`🛣️ Último día (${F.fecha(ult.fecha)})`, F.dinero(ult.netoKm) + '<span class="peq suave">/km</span>', `${cmp(ult.netoKm, prom)} frente al promedio del mes`, '#/jornada/' + ult.fecha);
    h += tarjeta('📅 Promedio del mes', `<span class="c-cuota">${F.dinero(prom)}</span><span class="peq suave">/km</span>`, `${mes.dias} días · ${F.num(mes.km)} km` + (prev.dias ? ` · ${cmp(prom, prev.netoKm)} vs mes anterior` : ''), '!irLista');
    h += tarjeta('📈 Acumulado desde el inicio', F.dinero(total.netoKm) + '<span class="peq suave">/km</span>', `${total.dias} días · ${F.num(total.km)} km`, '!irLista');
    h += tarjeta('⏱️ Neto por hora (mes)', F.dinero(mes.netoHora), mes.horas ? `${F.num(mes.horas)} horas registradas` : 'faltan horas', '!irLista');
    h += tarjeta('💵 Bruto por km (mes)', F.dinero(mes.brutoKm), 'lo que paga Uber por km', '!irLista');
    h += tarjeta('⛽ Gasolina por km (mes)', `<span class="c-comb">${F.dinero(mes.combKm)}</span>`, mes.provisional ? 'incluye días con gasolina provisional' : 'con lo realmente pagado', '#/informes/3');
    h += '</div>';

    // ---- Ideas para que el km valga más (con los datos reales de Edwin, desde el inicio)
    const todos = C.jornadas.filter(r => r.trabaja && r.ingreso != null && r.km > 0);
    const ideas = [];
    const oficialesMes = M.oficialesMes || 21;
    ideas.push(`Con tus ~${F.num(mes.kmDia, 0)} km por día, cada <b>$100 más por km</b> son <b>${F.dinero(100 * mes.kmDia)}</b> más por día y unos <b>${F.dinero(100 * mes.kmDia * oficialesMes)}</b> al mes (${oficialesMes} jornadas oficiales).`);
    const porDia = {};
    todos.forEach(r => { const d = Calc.diaSemana(r.fecha); (porDia[d] = porDia[d] || []).push(r); });
    const filasDia = Object.keys(porDia).map(d => ({ d: +d, e: E(porDia[d]) })).sort((a, b) => b.e.netoKm - a.e.netoKm);
    if (filasDia.length >= 2) {
      const mejor = filasDia[0], peorD = filasDia[filasDia.length - 1];
      ideas.push(`Tu mejor día de la semana es el <b>${Calc.DIAS[mejor.d].toLowerCase()}</b> (${F.dinero(mejor.e.netoKm)}/km) y el más flojo el <b>${Calc.DIAS[peorD.d].toLowerCase()}</b> (${F.dinero(peorD.e.netoKm)}/km).`);
    }
    const conAire = todos.filter(r => r.fracAire != null && r.fracAire >= 0.5), sinAire = todos.filter(r => r.fracAire != null && r.fracAire < 0.5);
    if (conAire.length && sinAire.length) {
      const a = E(conAire), s = E(sinAire);
      ideas.push(`Días con aire la mitad del tiempo o más: <b>${F.dinero(a.netoKm)}/km</b> (${a.dias} días). Días con poco aire: <b>${F.dinero(s.netoKm)}/km</b> (${s.dias} días). La gasolina por km sube ${F.dinero(a.combKm - s.combKm)} con el aire.`);
    }
    if (todos.length >= 4) {
      const orden = todos.slice().sort((a, b) => a.km - b.km), mitad = Math.floor(orden.length / 2);
      const cortos = E(orden.slice(0, mitad)), largos = E(orden.slice(mitad));
      ideas.push(`Días largos (más de ${F.num(orden[mitad].km, 0)} km): <b>${F.dinero(largos.netoKm)}/km</b> · días cortos: <b>${F.dinero(cortos.netoKm)}/km</b>. ${largos.netoKm >= cortos.netoKm ? 'Rodar más te está rindiendo.' : 'Los km de más te rinden menos: puede haber muchos km vacíos (sin pasajero).'}`);
    }
    const bajos = dias.filter(r => r.netoKm < prom).length;
    ideas.push(`Este mes ${bajos} de ${dias.length} días quedaron por debajo de tu promedio. Revisa en la lista de abajo qué tuvieron en común (hora, zona, aire, km).`);
    h += `<div class="caja pozo"><h3 style="margin-top:0" class="c-pozo">💡 Para que tu km valga más</h3>${ideas.map(t => `<p>• ${t}</p>`).join('')}<p class="peq suave">Calculado con tus jornadas reales. Con más días registrados, estas comparaciones se vuelven más confiables.</p></div>`;

    h += grafica('gKm', '🛣️ Valor neto del km por día (verde = sobre tu promedio)', dias.map(r => ({
      et: String(+r.fecha.slice(8)), v: r.netoKm, color: r.netoKm >= prom ? 'var(--bien)' : 'var(--mal)', ir: '#/jornada/' + r.fecha,
      txt: F.fecha(r.fecha) + ' · ' + F.dinero(r.netoKm) + '/km neto · ' + F.num(r.km) + ' km'
    })), { linea: prom, lineaTxt: 'promedio ' + F.dinero(prom) });

    if (filasDia.length) {
      h += '<h2>Por día de la semana <span class="peq suave">(desde el inicio)</span></h2><div class="caja"><div class="reparto">';
      h += filasDia.map(x => ln(`${Calc.DIAS[x.d]} <span class="peq suave">· ${x.e.dias} día${x.e.dias === 1 ? '' : 's'}</span>`, `${F.dinero(x.e.netoKm)}/km · ${F.dinero(x.e.netoHora)}/h`)).join('');
      h += '</div></div>';
    }
    const ord = dias.slice().sort((a, b) => b.netoKm - a.netoKm);
    if (dias.length >= 4) {
      const fila = r => `<a class="btn sec chico" style="width:100%;justify-content:space-between;margin:4px 0" href="#/jornada/${r.fecha}"><span>${F.fecha(r.fecha)} · ${F.num(r.km)} km</span><span>${F.dinero(r.netoKm)}/km</span></a>`;
      h += `<div class="dos"><div><h3>🏆 Mejores días</h3>${ord.slice(0, 3).map(fila).join('')}</div><div><h3>🐢 Más flojos</h3>${ord.slice(-3).reverse().map(fila).join('')}</div></div>`;
    }
    h += `<h2 id="kmLista">Día a día de ${F.mes(mesVista)}</h2><button class="btn sec" data-accion="excel" data-q="km">📊 Descargar Excel del valor del km</button><div class="lista" style="margin-top:12px">`;
    h += dias.slice().reverse().map(r => `<button class="item" data-ir="#/jornada/${r.fecha}"><div class="arriba"><b>${F.fecha(r.fecha)} · ${TIPOS[r.tipo][0]} ${TIPOS[r.tipo][1]}</b><span class="valor ${r.netoKm >= prom ? 'bien' : 'mal'}">${F.dinero(r.netoKm)}/km</span></div>
      <div class="datos"><span>🛣️ <b>${F.num(r.km)}</b> km</span><span>💵 <b>${F.dinero(r.ingreso / r.km)}</b>/km bruto</span><span>⛽ <b>${F.dinero(r.combKm)}</b>/km${r.combEstado === 'estimado' ? ' (prov.)' : ''}</span><span>Neto del día <b>${F.dinero(r.neto)}</b></span>${r.netoHora != null ? `<span>⏱️ <b>${F.dinero(r.netoHora)}</b>/h</span>` : ''}${r.fracAire != null ? `<span>❄️ ${F.num(r.fracAire * 100, 0)} % con aire</span>` : ''}<span>${cmp(r.netoKm, prom)} vs promedio</span></div></button>`).join('');
    h += '</div>';
    return h;
  }
  ACC.irLista = () => { const t = $('#kmLista'); if (t) t.scrollIntoView({ behavior: 'smooth' }); };
  function itemDia(r) {
    if (r.pendiente) return `<button class="item pend" data-ir="#/jornada/${r.fecha}"><div class="arriba"><b>${F.fecha(r.fecha)}</b>${etiqueta('pendiente')}</div><div class="datos"><span>${r.oficialDia ? 'Día oficial' : 'Día no oficial'} sin registro · toca para registrar</span></div></button>`;
    const T = TIPOS[r.tipo];
    let d = '';
    if (r.trabaja) d += `<span>🛣️ <b>${F.num(r.km)}</b> km</span><span>⏱️ <b>${F.num(r.horas)}</b> h</span><span>⛽ <b>${F.dinero(r.combustible)}</b>${r.combEstado === 'estimado' ? ' (prov.)' : ''}</span>${r.netoKm != null ? `<span>💎 <b>${F.dinero(r.netoKm)}</b>/km neto</span>` : ''}`;
    if (r.tipo === 'oficial' && r.ingreso != null) d += `<span>🎯 <b class="${r.difMeta >= 0 ? 'bien' : 'mal'}">${r.difMeta >= 0 ? '+' : ''}${F.dinero(r.difMeta)}</b></span>`;
    if (r.ahorro > 0) d += `<span>🐷 <b>${F.dinero(r.ahorro)}</b></span>`;
    if (r.excedente > 0) d += `<span>💧 <b>+${F.dinero(r.excedente)}</b></span>`;
    if (r.apoyo > 0) d += `<span>💧 apoyo <b>${F.dinero(r.apoyo)}</b></span>`;
    if (r.apoyoPendiente > 0) d += `<span class="aviso">💧 por confirmar <b>${F.dinero(r.apoyoPendiente)}</b></span>`;
    if (r.tipo === 'oficial' || r.tipo === 'novedad') d += `<span>🚗 <b>${F.dinero(r.cuota)}</b></span>`;
    if (r.tramos.length > 1) d += `<span>Tramos: ${r.tramos.map(t => (t.intervalo ? esc(t.intervalo.nombre) : '?') + ' ' + F.num(t.km) + ' km').join(' · ')}</span>`;
    else if (r.intervalos.length) d += `<span>Intervalo ${esc(r.intervalos.join(', '))}</span>`;
    if (r.jornada.obs) d += `<span>📝 ${esc(r.jornada.obs)}</span>`;
    const al = r.alertas.find(a => a.nivel === r.estado) || r.alertas[0];
    return `<button class="item ${r.tipo === 'descanso' ? 'descanso' : ''}" data-ir="#/jornada/${r.fecha}"><div class="arriba"><b>${F.fecha(r.fecha)} · ${T[0]} ${T[1]}</b><span class="valor">${r.trabaja ? F.dinero(r.ingreso) : ''}</span></div><div class="datos">${d}</div>${r.estado !== 'confirmado' ? `<div style="margin-top:6px">${etiqueta(r.estado)} <span class="peq suave">${esc(al ? al.texto : 'Combustible provisional')}</span></div>` : ''}</button>`;
  }
  function informe1() {
    const M = C.resumenMes(mesVista);
    const tipoDe = r => (r.pendiente ? 'sin registro' : r.tipo);
    const ver = M.filas.filter(r => !filtroTipos.size || filtroTipos.has(tipoDe(r)) || (filtroTipos.has('revisar') && r.estado !== 'confirmado'));
    const s = c => ver.reduce((a, r) => a + (esNum(r[c]) ? r[c] : 0), 0);
    let h = `<div class="chips" style="margin-bottom:10px">${[['oficial', '🚗 Oficial'], ['excepcional', '⭐ Excepcional'], ['descanso', '😴 Descanso'], ['novedad', '🤒 Novedad'], ['sin registro', '❔ Sin registro'], ['revisar', '⚠️ Con algo por revisar']].map(([v, t]) => `<button class="chip mini ${filtroTipos.has(v) ? 'on' : ''}" data-accion="filtroTipo" data-v="${v}">${t}</button>`).join('')}${filtroTipos.size ? '<button class="chip mini" data-accion="filtroTipo" data-v="">✕ Todos</button>' : ''}</div>`;
    h += `<div class="caja"><div class="reparto">${ln('💵 Ingreso bruto', F.dinero(s('ingreso')))}${ln('🛣️ Kilómetros · horas', F.num(s('km')) + ' km · ' + F.num(s('horas')) + ' h')}${ln('⛽ Combustible asignado', F.dinero(s('combustible')))}${ln('🐷 Ahorro', F.dinero(s('ahorro')))}${ln('💧 Al Pozo · apoyos del Pozo', F.dinero(s('excedente')) + ' · ' + F.dinero(s('apoyo')))}${ln('🚗 Para la cuota', F.dinero(s('cuota')), 'tot')}</div><p class="peq suave">${ver.length} días mostrados${filtroTipos.size ? ' (con filtro)' : ''} · del 1 al ${M.filas.length ? +M.filas[M.filas.length - 1].fecha.slice(8) : 0} de ${F.mes(mesVista).split(' ')[0].toLowerCase()}</p></div>`;
    h += '<button class="btn sec" data-accion="excel" data-q="diario">📊 Descargar Excel del día a día</button>';
    h += '<div class="lista" style="margin-top:12px">' + (ver.map(itemDia).join('') || '<p class="suave">Nada con ese filtro.</p>') + '</div>';
    return h;
  }
  ACC.filtroTipo = el => { const v = el.dataset.v; if (!v) filtroTipos.clear(); else if (filtroTipos.has(v)) filtroTipos.delete(v); else filtroTipos.add(v); pintar(); };
  function informe2() {
    const M = C.resumenMes(mesVista), P = M.pozo, pct = Math.min(100, M.cuotaPct * 100);
    let h = '<div class="tarjetas">';
    h += tarjeta('1. 🚗 Dinero para la cuota', `<span class="c-cuota">${F.dinero(M.cuota)}</span>`, `${F.num(M.cuotaPct * 100)} % de ${F.dinero(M.cuotaMeta)} · faltan ${F.dinero(M.cuotaPendiente)}`, '#/cuota', `<div class="barra-p"><i style="width:${pct}%"></i></div>`, 'ancha');
    h += tarjeta('2. 🐷 Ahorro obligatorio', `<span class="c-ahorro">${F.dinero(M.ahorro)}</span>`, `desde el inicio: ${F.dinero(C.ahorroTotal)}`, '#/ahorro');
    h += tarjeta('3. 💧 Saldo del Pozo', `<span class="c-pozo">${F.dinero(P ? P.final : C.pozoSaldo)}</span>`, P ? `arrancó ${F.dinero(P.inicial)} · +${F.dinero(P.aportes)} −${F.dinero(P.apoyos + P.gastos)}` : '', '#/pozo');
    h += tarjeta('4. ⛽ Pagado en tanqueos', `<span class="c-comb">${F.dinero(M.pagado)}</span>`, 'dinero real que salió en la bomba', '#/tanqueos');
    h += tarjeta('5. 💵 Ingreso bruto Uber', F.dinero(M.ingreso), `${M.trabajadas} días trabajados`, '#/informes/1');
    h += '</div>';
    h += `<div class="caja"><h3 style="margin-top:0;color:var(--texto)">🧮 Cuadre del ingreso (nada se cuenta dos veces)</h3><div class="reparto">
      ${ln('💵 Ingreso bruto Uber', F.dinero(M.ingreso), 'tot')}
      ${ln('= 💧 Al Pozo (excedentes + martes/domingos)', F.dinero(M.excedente))}
      ${ln('+ ⛽ Combustible cubierto con el ingreso', F.dinero(M.deIngreso.comb))}
      ${ln('+ 🐷 Ahorro cubierto con el ingreso', F.dinero(M.deIngreso.ahorro))}
      ${ln('+ 🚗 Cuota de la operación', F.dinero(M.deIngreso.cuota))}
      ${ln('Suma', F.dinero(M.excedente + M.deIngreso.comb + M.deIngreso.ahorro + M.deIngreso.cuota) + (Math.abs(M.excedente + M.deIngreso.comb + M.deIngreso.ahorro + M.deIngreso.cuota - M.ingreso) < 1 ? ' ✅' : ' ⚠️'), 'tot')}
      </div><p class="peq suave">Los apoyos del Pozo (${F.dinero(M.apoyo)}) son traslados internos: salen del Pozo y llegan a la cuota o al ahorro, no son ingreso nuevo. El combustible asignado a las jornadas (${F.dinero(M.combustible)}) es un cálculo por kilómetro; lo pagado en la bomba (${F.dinero(M.pagado)}) es otra cifra.</p></div>`;
    h += `<div class="botones dos"><button class="btn sec" data-accion="excel" data-q="pozo">📊 Excel del Pozo</button><button class="btn sec" data-accion="excel" data-q="diario">📊 Excel día a día</button></div>`;
    return h;
  }
  function informe3() {
    const ref = C.ref, hoy = C.hoy;
    let h = `<div class="caja"><div class="reparto">
      ${ln('📈 Rendimiento real acumulado', ref.real ? F.num(ref.rendimiento, 2) + ' km/gal' : 'sin intervalos cerrados')}
      ${ln('   km ÷ galones de intervalos cerrados', ref.real ? F.num(ref.km) + ' ÷ ' + F.num(ref.galones, 2) : '—')}
      ${ln('💲 Costo real por km', ref.costoKmReal != null ? F.dinero(ref.costoKmReal) : '—')}
      ${ln(`📋 Presupuestado (${F.dinero(C.precio(hoy))} ÷ ${F.num(C.cfg.rendimientoConAire)} km/gal)`, F.dinero(ref.presupuestado(hoy)))}
      ${ref.costoKmReal != null ? ln('Diferencia (real − presupuestado)', `<span class="${ref.costoKmReal > ref.presupuestado(hoy) ? 'mal' : 'bien'}">${F.dinero(ref.costoKmReal - ref.presupuestado(hoy))}/km</span>`) : ''}
      ${ref.mejor ? ln('🏆 Mejor intervalo', esc(ref.mejor.nombre) + ' · ' + F.num(ref.mejor.rendimiento, 2) + ' km/gal') : ''}
      ${ref.peor ? ln('🐢 Menor intervalo', esc(ref.peor.nombre) + ' · ' + F.num(ref.peor.rendimiento, 2) + ' km/gal') : ''}
      ${ln('❄️ Con aire se calcula', '+' + F.num(C.cfg.aireConsumeMas) + ' % de gasolina por km')}
      </div><p class="peq suave">El promedio es kilómetros totales ÷ galones totales (no el promedio de los intervalos). Las jornadas de intervalos abiertos usan un costo provisional con el precio vigente y este rendimiento.</p></div>`;
    h += '<div class="lista">' + C.intervalos.slice().reverse().map(htmlIntervalo).join('') + '</div>';
    h += '<div class="botones dos"><button class="btn sec" data-accion="excel" data-q="intervalos">📊 Excel de intervalos</button><button class="btn sec" data-accion="excel" data-q="tanqueos">📊 Excel de tanqueos</button></div>';
    return h;
  }
  function informeGraficas() {
    const M = C.resumenMes(mesVista), dias = M.filas.filter(r => !r.pendiente && r.trabaja);
    const dia = r => String(+r.fecha.slice(8));
    let h = grafIngresos('g1', M);
    h += grafica('g2', '🛣️ Kilómetros por día', dias.map(r => ({ et: dia(r), v: r.km, color: 'var(--info)', ir: '#/jornada/' + r.fecha, txt: F.fecha(r.fecha) + ' · ' + F.num(r.km) + ' km' })), { linea: Calc.vigente(C.cfg.kmReferencia, M.mes + '-01'), lineaTxt: 'referencia' });
    h += grafica('g3', '⏱️ Ingreso por hora', dias.filter(r => r.ingresoHora != null).map(r => ({ et: dia(r), v: r.ingresoHora, color: 'var(--bien)', ir: '#/jornada/' + r.fecha, txt: F.fecha(r.fecha) + ' · ' + F.dinero(r.ingresoHora) + '/hora' })));
    h += grafica('g4', '💲 Costo de combustible por km', dias.filter(r => r.km > 0).map(r => ({ et: dia(r), v: r.combustible / r.km, color: r.combEstado === 'estimado' ? 'var(--aviso)' : 'var(--comb)', ir: '#/jornada/' + r.fecha, txt: F.fecha(r.fecha) + ' · ' + F.dinero(r.combustible / r.km) + '/km' + (r.combEstado === 'estimado' ? ' (provisional)' : '') })));
    h += grafica('g5', '📈 Rendimiento por intervalo (km/gal)', C.intervalos.filter(i => i.valido).map(i => ({ et: i.nombre.replace(' → ', '→'), v: i.rendimiento, color: 'var(--comb)', ir: '#/informes/3', txt: i.nombre + ' · ' + F.num(i.rendimiento, 2) + ' km/gal' })), { linea: C.cfg.rendimientoConAire, lineaTxt: 'estimado' });
    let acum = 0;
    h += grafica('g6', '🚗 Evolución de la cuota', M.filas.filter(r => !r.pendiente).map(r => { acum += r.cuota || 0; return { et: dia(r), v: acum, color: 'var(--cuota)', ir: '#/jornada/' + r.fecha, txt: F.fecha(r.fecha) + ' · acumulado ' + F.dinero(acum) }; }), { linea: M.cuotaMeta, lineaTxt: 'cuota' });
    const P = M.pozo;
    if (P) h += grafica('g7', '💧 Movimientos del Pozo (saldo después de cada uno)', P.movimientos.map(m => ({ et: m.fecha ? String(+m.fecha.slice(8)) : '?', v: m.saldo, color: m.tipo === 'aporte' ? 'var(--pozo)' : 'var(--mal)', ir: m.tipo === 'gasto' ? '#/gasto/' + m.id : '#/jornada/' + m.jornada, txt: (m.fecha ? F.fecha(m.fecha) : 'Sin fecha') + ' · ' + m.concepto + ' ' + (m.tipo === 'aporte' ? '+' : '−') + F.dinero(m.valor) + (m.estado !== 'confirmado' ? ' (pendiente)' : '') + ' → saldo ' + F.dinero(m.saldo) })));
    return h;
  }

  // ================================================================ EXCEL (formato azul petróleo, un archivo = una hoja)
  function cargarExcel() {
    if (window.excelAzul) return Promise.resolve();
    return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = 'excel_azul.js'; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el módulo de Excel')); document.head.appendChild(s); });
  }
  const rd = v => (esNum(v) ? Math.round(v) : null);
  const r1 = v => (esNum(v) ? Math.round(v * 10) / 10 : null);
  const r2 = v => (esNum(v) ? Math.round(v * 100) / 100 : null);
  ACC.excel = async el => {
    await cargarExcel();
    const q = el.dataset.q, M = C.resumenMes(mesVista), nm = F.mes(mesVista);
    let hoja, archivo;
    if (q === 'diario') {
      const cols = [['Fecha', 'txt'], ['Día', 'txt'], ['Tipo de jornada', 'txt'], ['Ingreso bruto', 'int'], ['Meta diaria', 'int'], ['Diferencia frente a meta', 'int'], ['Km recorridos', 'dec1'], ['Diferencia frente a km de referencia', 'dec1'], ['Horas trabajadas', 'dec1'], ['Horas con aire', 'dec1'], ['Horas sin aire', 'dec1'], ['Combustible asignado', 'int'], ['Estado del combustible', 'txt'], ['Ahorro obligatorio', 'int'], ['Excedente al Pozo', 'int'], ['Apoyo del Pozo', 'int'], ['Cuota de la operación', 'int'], ['Dinero asignado a la cuota', 'int'], ['Ingreso por km', 'int'], ['Ingreso por hora', 'int'], ['Valor neto por km', 'int'], ['Neto por hora', 'int'], ['Intervalos', 'txt'], ['Tramos', 'txt'], ['Estado', 'txt'], ['Observaciones', 'txt']];
      const filas = M.filas.map(r => r.pendiente ? [F.fechaNum(r.fecha), r.dia, 'Sin registro', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Pendiente', ''] : [
        F.fechaNum(r.fecha), r.dia, TIPOS[r.tipo][1], r.trabaja ? rd(r.ingreso) : null, r.meta || null, r.tipo === 'oficial' && r.ingreso != null ? rd(r.difMeta) : r.tipo === 'novedad' ? rd(r.difMeta) : null,
        r.trabaja ? r1(r.km) : null, r.trabaja ? r1(r.difKm) : null, r.trabaja ? r1(r.horas) : null, r.trabaja ? r1(r.horasCon) : null, r.trabaja ? r1(r.horasSin) : null,
        r.trabaja ? rd(r.combustible) : null, r.trabaja ? NOMBRE_ESTADO[r.combEstado] : '', rd(r.ahorro), rd(r.excedente), rd(r.apoyo), rd(r.cuotaOperativa), rd(r.cuota),
        rd(r.ingresoKm), rd(r.ingresoHora), rd(r.netoKm), rd(r.netoHora), r.intervalos.join(', '), r.tramos.length > 1 ? r.tramos.map(t => (t.intervalo ? t.intervalo.nombre : '?') + ': ' + F.num(t.km) + ' km').join(' · ') : '',
        NOMBRE_ESTADO[r.estado], r.jornada.obs || ''
      ]);
      hoja = { nombre: 'Detalle diario', columnas: cols.map(([t, tipo]) => ({ t, tipo })), filas };
      archivo = `Mi Balance - Dia a dia - ${nm}.xlsx`;
    } else if (q === 'km') {
      const dias = M.jornadas.filter(r => r.trabaja && r.ingreso != null && r.km > 0), E = Calc.estadKm(dias);
      hoja = { nombre: 'Valor del km', columnas: [['Fecha', 'txt'], ['Día', 'txt'], ['Tipo de jornada', 'txt'], ['Km recorridos', 'dec1'], ['Horas', 'dec1'], ['% del tiempo con aire', 'int'], ['Ingreso bruto', 'int'], ['Gasolina asignada', 'int'], ['Estado de la gasolina', 'txt'], ['Neto del día (ingreso − gasolina)', 'int'], ['Bruto por km', 'int'], ['Gasolina por km', 'int'], ['Valor neto por km', 'int'], ['Neto por hora', 'int'], ['Diferencia vs promedio del mes', 'int']].map(([t, tipo]) => ({ t, tipo })),
        filas: dias.map(r => [F.fechaNum(r.fecha), r.dia, TIPOS[r.tipo][1], r1(r.km), r1(r.horas), r.fracAire != null ? rd(r.fracAire * 100) : null, rd(r.ingreso), rd(r.combustible), NOMBRE_ESTADO[r.combEstado], rd(r.neto), rd(r.ingreso / r.km), rd(r.combKm), rd(r.netoKm), rd(r.netoHora), rd(r.netoKm - E.netoKm)])
          .concat([['Total del mes', '', '', r1(E.km), r1(E.horas), null, rd(E.ingreso), rd(E.comb), '', rd(E.neto), rd(E.brutoKm), rd(E.combKm), rd(E.netoKm), rd(E.netoHora), null]]) };
      archivo = `Mi Balance - Valor del km - ${nm}.xlsx`;
    } else if (q === 'pozo') {
      const P = M.pozo;
      hoja = { nombre: 'Pozo de Eficiencia', columnas: [['Fecha', 'txt'], ['Mes', 'txt'], ['Concepto', 'txt'], ['Tipo', 'txt'], ['Valor', 'int'], ['Justificación', 'txt'], ['Estado', 'txt'], ['Saldo resultante', 'int']].map(([t, tipo]) => ({ t, tipo })),
        filas: [[F.fechaNum(mesVista + '-01'), F.mes(mesVista), 'Saldo inicial del mes', 'Saldo inicial', rd(P ? P.inicial : 0), P && P.fijo ? 'Fijado por Edwin' : 'Cierre del mes anterior', 'Confirmado', rd(P ? P.inicial : 0)]]
          .concat((P ? P.movimientos : []).map(m => [m.fecha ? F.fechaNum(m.fecha) : 'Sin fecha', F.mes(m.mes), m.concepto, { aporte: 'Aporte', apoyo: 'Apoyo a meta', gasto: 'Gasto' }[m.tipo] || m.tipo, rd(m.tipo === 'aporte' ? m.valor : -m.valor), m.justificacion || '', NOMBRE_ESTADO[m.estado] || m.estado, rd(m.saldo)])) };
      archivo = `Mi Balance - Pozo - ${nm}.xlsx`;
    } else if (q === 'intervalos') {
      hoja = { nombre: 'Intervalos', columnas: [['Intervalo', 'txt'], ['Tanqueo inicial', 'txt'], ['Fecha inicial', 'txt'], ['Tanqueo final', 'txt'], ['Fecha final', 'txt'], ['Km acumulados', 'dec1'], ['Galones', 'dec2'], ['Valor del tanqueo', 'int'], ['Rendimiento km/galón', 'dec2'], ['Costo por km', 'int'], ['Estado', 'txt']].map(([t, tipo]) => ({ t, tipo })),
        filas: C.intervalos.map(i => [i.nombre, i.inicio.letra, F.fechaNum(i.inicio.fecha), i.fin ? i.fin.letra : '', i.fin ? F.fechaNum(i.fin.fecha) : '', r1(i.km), i.valido ? r2(i.galones) : null, i.valido ? rd(i.valor) : null, i.valido ? r2(i.rendimiento) : null, i.valido ? rd(i.costoKm) : rd(i.costoKmEstimado), !i.cerrado ? 'Abierto' : !i.valido ? 'Pendiente' : i.aproximado ? 'Cerrado (aproximado)' : 'Cerrado']) };
      archivo = 'Mi Balance - Intervalos de combustible.xlsx';
    } else {
      hoja = { nombre: 'Tanqueos', columnas: [['Tanqueo', 'txt'], ['Fecha', 'txt'], ['Hora', 'txt'], ['Valor pagado', 'int'], ['Galones', 'dec2'], ['Precio por galón', 'int'], ['Tanque lleno', 'txt'], ['Estado de los datos', 'txt'], ['Observaciones', 'txt']].map(([t, tipo]) => ({ t, tipo })),
        filas: C.tanqueos.map(t => [t.letra, F.fechaNum(t.fecha), t.hora || '', rd(t.valor), r2(t.galones), esNum(t.valor) && esNum(t.galones) ? rd(t.valor / t.galones) : null, t.lleno ? 'Sí' : 'No', NOMBRE_ESTADO[t.estado] || '', t.obs || '']) };
      archivo = 'Mi Balance - Tanqueos.xlsx';
    }
    await window.excelAzul.descargar(archivo, [hoja]);
    toast('📊 Excel descargado (carpeta Descargas)');
  };

  // ================================================================ MÁS, REVISIÓN, CONFIGURACIÓN, RESPALDO, AYUDA
  function vMas() {
    const it = (ir, ic, t, sub) => `<button class="item" data-ir="${ir}"><div class="arriba"><b>${ic} ${t}</b><span>›</span></div>${sub ? `<div class="datos"><span>${sub}</span></div>` : ''}</button>`;
    const pend = C.auditoria.filter(a => a.nivel !== 'aproximado').length;
    const h = '<div class="lista">' +
      it('#/tanqueos', '⛽', 'Tanqueos e intervalos', 'Registrar tanqueos, rendimiento real') +
      it('#/informes/1', '📅', 'Informe día a día', 'Detalle de cada jornada del mes') +
      it('#/km', '🛣️', 'Mi kilómetro', 'Cuánto vale tu km neto de gasolina, por día y acumulado') +
      it('#/informes/2', '📊', 'Acumulados financieros', 'Cuota, ahorro, Pozo, combustible e ingresos') +
      it('#/informes/3', '⛽', 'Intervalos de combustible', 'Rendimiento y costo por km') +
      it('#/informes/g', '📈', 'Gráficas', '') +
      it('#/cuota', '🚗', 'Cuota del carro', '') +
      it('#/ahorro', '🐷', 'Ahorro obligatorio', '') +
      it('#/auditoria', '🔍', 'Revisión de datos', pend ? `${pend} por completar o revisar` : 'Todo al día') +
      it('#/respaldo', '💾', 'Respaldo y Excel', 'Último respaldo: ' + (C.cfg.ultimoRespaldo ? F.fecha(C.cfg.ultimoRespaldo.slice(0, 10)) : 'nunca')) +
      it('#/config', '⚙️', 'Configuración', 'Precio del galón, metas, días de trabajo, aire') +
      it('#/ayuda', '❓', 'Cómo funciona e instalación', '') + '</div>';
    return { titulo: 'Más', html: h, nav: 'mas' };
  }
  function vAuditoria() {
    const g = { inconsistente: [], pendiente: [], aproximado: [] };
    C.auditoria.forEach(a => g[a.nivel] && g[a.nivel].push(a));
    const titulos = { inconsistente: '❌ Inconsistente (revisar ya)', pendiente: '⏳ Pendiente (falta información)', aproximado: '≈ Aproximado (dato estimado)' };
    let h = '<p class="ayuda">Nada se corrige solo: toca cada punto para ir a donde se arregla.</p>';
    for (const n of ['inconsistente', 'pendiente', 'aproximado']) {
      if (!g[n].length) continue;
      h += `<h2>${titulos[n]} · ${g[n].length}</h2><div class="lista">` + g[n].map(a => `<button class="item" data-ir="${a.ir}"><div class="arriba"><span>${etiqueta(n)} ${esc(a.texto)}</span><span>›</span></div></button>`).join('') + '</div>';
    }
    if (!C.auditoria.length) h += '<div class="caja" style="text-align:center"><p style="font-size:2rem">✅</p><p>Todo está completo y confirmado.</p></div>';
    return { titulo: 'Revisión de datos', atras: true, nav: 'mas', html: h };
  }
  function editorVigencia(clave, titulo, tipo, ayuda) {
    const lista = (D.config[clave] || []).slice().sort((a, b) => (a.desde < b.desde ? 1 : -1));
    const ver = v => (tipo === 'dinero' ? F.dinero(v) : F.num(v) + ' km');
    return `<div class="caja"><div class="arriba" style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><b>${titulo}</b><b style="font-size:1.35rem" class="num">${ver(Calc.vigente(D.config[clave], C.hoy))}</b></div><p class="ayuda">${ayuda}</p>
      <details><summary style="min-height:48px;display:flex;align-items:center;cursor:pointer;font-weight:700">✏️ Cambiar con fecha de vigencia · historial</summary>
      <div class="reparto">${lista.map(v => ln('Desde ' + F.fecha(v.desde), ver(v.valor))).join('')}</div>
      <div class="dos" style="margin-top:10px"><div><label class="etq" for="v-${clave}">Nuevo valor</label><input id="v-${clave}" inputmode="${tipo === 'dinero' ? 'numeric' : 'decimal'}" data-dinero="${tipo === 'dinero' ? 1 : ''}"></div><div><label class="etq" for="d-${clave}">Desde</label><input id="d-${clave}" type="date" value="${C.hoy}"></div></div>
      <button class="btn prim" style="margin-top:10px" data-accion="guardarVigencia" data-c="${clave}" data-tipo="${tipo}">Guardar cambio</button></details></div>`;
  }
  function vConfig() {
    const cfg = C.cfg;
    let h = '<p class="ayuda">Los cambios con fecha solo aplican desde esa fecha: los días anteriores no se tocan.</p>';
    h += editorVigencia('precioGalon', '⛽ Precio del galón', 'dinero', 'Se usa para el combustible provisional (intervalos abiertos). Los intervalos cerrados usan lo que realmente pagaste.');
    h += editorVigencia('metaDiaria', '🎯 Meta diaria', 'dinero', 'Lo que pase de aquí en una jornada oficial va al Pozo.');
    h += editorVigencia('ahorroJornada', '🐷 Ahorro por jornada oficial', 'dinero', 'Se separa en cada jornada oficial trabajada.');
    h += editorVigencia('cuotaMensual', '🚗 Cuota mensual del carro', 'dinero', 'Meta del fondo de la cuota (se toma la vigente el día 1 de cada mes).');
    h += editorVigencia('kmReferencia', '🛣️ Kilómetros de referencia por día', 'km', 'Solo referencia de productividad, no es un límite.');
    h += `<div class="caja"><b>📅 Días oficiales de trabajo</b><div class="chips" style="margin-top:8px">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button class="chip ${cfg.diasOficiales.includes(d) ? 'on' : ''}" data-accion="diaOficial" data-d="${d}">${Calc.DIAS[d]}</button>`).join('')}</div><p class="ayuda">Los demás días, si se trabajan, van completos al Pozo.</p></div>`;
    h += `<div class="caja"><b>❄️ Combustible y aire acondicionado</b>
      <div class="dos" style="margin-top:8px"><div><label class="etq" for="cRend">Km por galón con aire (estimado)</label><input id="cRend" inputmode="decimal" value="${verDecimal(cfg.rendimientoConAire)}"></div>
      <div><label class="etq" for="cAire">El aire gasta % más</label><input id="cAire" inputmode="decimal" value="${verDecimal(cfg.aireConsumeMas)}"></div></div>
      <p class="ayuda">El estimado solo se usa hasta cerrar el primer intervalo. El % de aire reparte la gasolina de cada intervalo entre los días según las horas con aire. Con varios intervalos cerrados podremos medirlo de verdad y ajustarlo aquí.</p>
      <button class="btn prim" data-accion="guardarAire">Guardar</button></div>`;
    h += `<div class="caja"><b>🎨 Apariencia</b><div class="chips" style="margin-top:8px"><button class="chip ${cfg.tema !== 'claro' ? 'on' : ''}" data-accion="tema" data-v="oscuro">🌙 Oscuro</button><button class="chip ${cfg.tema === 'claro' ? 'on' : ''}" data-accion="tema" data-v="claro">☀️ Claro (para el sol)</button></div></div>`;
    h += `<a class="btn sec" href="#/pozo">💧 Saldo inicial del Pozo de cada mes (en la pantalla del Pozo)</a>`;
    return { titulo: 'Configuración', atras: true, nav: 'mas', html: h, despues: () => document.querySelectorAll('input[data-dinero="1"]').forEach(i => i.addEventListener('input', () => { i.value = verDinero(leerDinero(i.value)); })) };
  }
  ACC.guardarVigencia = async el => {
    const c = el.dataset.c, tipo = el.dataset.tipo;
    const v = tipo === 'dinero' ? leerDinero($('#v-' + c).value) : leerDecimal($('#v-' + c).value), desde = $('#d-' + c).value;
    if (!v || v <= 0) return toast('Escribe el nuevo valor', true);
    if (!desde) return toast('Elige desde qué fecha aplica', true);
    const afectados = D.jornadas.filter(j => j.fecha >= desde).length;
    if (desde < C.hoy && !(await confirmar('¿Cambiar desde una fecha pasada?', `Se recalcularán ${afectados} jornada(s) desde el ${F.fecha(desde)}. Las anteriores no cambian.`, 'Sí, aplicar'))) return;
    const cfg = clonar(D.config);
    cfg[c] = (cfg[c] || []).filter(x => x.desde !== desde).concat([{ desde, valor: v }]);
    const antes = await guardar([{ tienda: 'config', dato: cfg }], '✅ Cambio guardado desde el ' + F.fecha(desde));
    pintar();
    await avisarCambios(antes, null);
  };
  ACC.diaOficial = async el => {
    const d = +el.dataset.d, cfg = clonar(D.config);
    const on = cfg.diasOficiales.includes(d);
    if (!(await confirmar(`¿${on ? 'Quitar' : 'Agregar'} el ${Calc.DIAS[d].toLowerCase()}?`, `Cambia la sugerencia de tipo de jornada y el conteo de días oficiales de cada mes. Las jornadas ya guardadas conservan su tipo.`, 'Sí, cambiar'))) return;
    cfg.diasOficiales = on ? cfg.diasOficiales.filter(x => x !== d) : cfg.diasOficiales.concat([d]);
    await guardar([{ tienda: 'config', dato: cfg }], '✅ Días de trabajo actualizados');
    pintar();
  };
  ACC.guardarAire = async () => {
    const rend = leerDecimal($('#cRend').value), aire = leerDecimal($('#cAire').value);
    if (!rend || rend < 10 || rend > 80) return toast('El rendimiento debe estar entre 10 y 80 km/gal', true);
    if (aire == null || aire < 0 || aire > 60) return toast('El % del aire debe estar entre 0 y 60', true);
    const cfg = clonar(D.config); cfg.rendimientoConAire = rend; cfg.aireConsumeMas = aire;
    const antes = await guardar([{ tienda: 'config', dato: cfg }], '✅ Guardado');
    pintar();
    await avisarCambios(antes, null);
  };
  ACC.tema = async el => {
    const cfg = clonar(D.config); cfg.tema = el.dataset.v;
    document.documentElement.dataset.tema = cfg.tema;
    try { localStorage.setItem('mb-tema', cfg.tema); } catch (e) { /* sin almacenamiento local: no pasa nada */ }
    await guardar([{ tienda: 'config', dato: cfg }]);
    pintar();
  };

  let persistente = null;
  function vRespaldo() {
    const u = C.cfg.ultimoRespaldo;
    let h = `<div class="caja" style="text-align:center"><div class="suave">Último respaldo</div><div style="font-size:1.4rem;font-weight:800">${u ? F.fechaLarga(u.slice(0, 10)) + ' · ' + u.slice(11, 16) : 'Nunca'}</div>
      <p class="peq suave">Tus datos se guardan en este teléfono, en este navegador. ${persistente === true ? '✅ El teléfono los marcó como permanentes.' : persistente === false ? '⚠️ El navegador aún no los marcó como permanentes: haz respaldos seguido.' : ''}</p></div>`;
    h += `<button class="btn prim" data-accion="respaldo">💾 Descargar respaldo completo</button><p class="ayuda">Guarda un archivo .json en la carpeta Descargas. Guárdalo también en Drive o envíatelo por correo: si pierdes el teléfono o borras el navegador, con ese archivo recuperas todo.</p>`;
    h += `<label class="btn sec" for="archivoRespaldo" style="margin-top:12px">📂 Restaurar desde un respaldo</label><input type="file" id="archivoRespaldo" accept=".json,application/json" hidden>
      <p class="ayuda">Antes de reemplazar te muestra qué trae el archivo y te pide confirmar.</p>`;
    h += '<h2>📊 Exportar a Excel</h2><div class="botones dos"><button class="btn sec" data-accion="excel" data-q="diario">Día a día del mes</button><button class="btn sec" data-accion="excel" data-q="pozo">Pozo del mes</button><button class="btn sec" data-accion="excel" data-q="intervalos">Intervalos</button><button class="btn sec" data-accion="excel" data-q="tanqueos">Tanqueos</button></div>';
    h += `<p class="ayuda">El mes de los informes es el que está elegido en Inicio (${F.mes(mesVista)}).</p>`;
    h += '<h2>⚠️ Zona delicada</h2><button class="btn peligro" data-accion="borrarTodo">🗑️ Borrar todos los datos de este teléfono</button><p class="ayuda">Solo para empezar de cero. Pide confirmación dos veces y te sugiere descargar un respaldo antes.</p>';
    return { titulo: 'Respaldo y Excel', atras: true, nav: 'mas', html: h, despues: () => $('#archivoRespaldo').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) restaurar(f).catch(err => toast('❌ ' + err.message, true)); }) };
  }
  ACC.respaldo = async () => {
    const ahora = new Date();
    const datos = { app: 'mi-balance', version: 1, creado: ahora.toISOString(), config: D.config, jornadas: D.jornadas, tanqueos: D.tanqueos, pozo: D.pozo };
    const blob = new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Mi Balance - respaldo ${C.hoy} ${String(ahora.getHours()).padStart(2, '0')}${String(ahora.getMinutes()).padStart(2, '0')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    const cfg = clonar(D.config); cfg.ultimoRespaldo = Calc.aTexto(ahora) + 'T' + ahora.toTimeString().slice(0, 8);
    await guardar([{ tienda: 'config', dato: cfg }], '💾 Respaldo descargado (carpeta Descargas)');
    pintar();
  };
  async function restaurar(archivo) {
    let datos;
    try { datos = JSON.parse(await archivo.text()); } catch (e) { throw new Error('Ese archivo no es un respaldo válido'); }
    const ok = datos && datos.app === 'mi-balance' && datos.config && Array.isArray(datos.jornadas) && Array.isArray(datos.tanqueos) && Array.isArray(datos.pozo)
      && datos.jornadas.every(j => /^\d{4}-\d{2}-\d{2}$/.test(j.fecha)) && datos.tanqueos.every(t => t.id && t.fecha) && datos.pozo.every(m => m.id && esNum(m.valor));
    if (!ok) throw new Error('Ese archivo no es un respaldo de Mi Balance');
    const r = await modal('¿Restaurar este respaldo?', `<div class="reparto">${ln('Creado', datos.creado ? F.fechaLarga(datos.creado.slice(0, 10)) + ' ' + datos.creado.slice(11, 16) : '—')}${ln('Jornadas', datos.jornadas.length + ' (hoy tienes ' + D.jornadas.length + ')')}${ln('Tanqueos', datos.tanqueos.length + ' (hoy ' + D.tanqueos.length + ')')}${ln('Movimientos del Pozo', datos.pozo.length + ' (hoy ' + D.pozo.length + ')')}</div><p class="aviso"><b>Todo lo que hay ahora en el teléfono se reemplaza por el respaldo.</b></p>`,
      [{ texto: 'Sí, reemplazar todo', clase: 'peligro' }, { texto: 'Cancelar' }]);
    if (r.i !== 0) return;
    const nuevo = { config: Object.assign({}, Calc.CONFIG_INICIAL, datos.config), jornadas: datos.jornadas, tanqueos: datos.tanqueos, pozo: datos.pozo };
    await DB.reemplazarTodo(nuevo);
    D = clonar(nuevo); recalcular();
    toast('✅ Respaldo restaurado');
    location.hash = '#/inicio'; pintar();
  }
  ACC.borrarTodo = async () => {
    const r = await modal('¿Borrar todo?', '<p>Se borran <b>todas</b> las jornadas, tanqueos y movimientos del Pozo de este teléfono. No se puede deshacer.</p><p>Te recomiendo descargar un respaldo antes.</p>', [{ texto: '💾 Primero descargar respaldo', clase: 'prim' }, { texto: 'Borrar sin respaldo', clase: 'peligro' }, { texto: 'Cancelar' }]);
    if (r.i === 0) { await ACC.respaldo(); return; }
    if (r.i !== 1) return;
    const r2 = await modal('Última confirmación', '<p>Escribe <b>BORRAR</b> para confirmar.</p><input id="mBorrar" autocomplete="off">', [{ texto: 'Borrar todo', clase: 'peligro', leer: h => (h.querySelector('#mBorrar').value.trim().toUpperCase() === 'BORRAR' ? true : (toast('Escribe BORRAR', true), false)) }, { texto: 'Cancelar' }]);
    if (r2.i !== 0) return;
    const vacio = { config: Object.assign({}, Calc.CONFIG_INICIAL, { inicio: C.hoy, saldoInicialPozo: { [Calc.mesDe(C.hoy)]: 0 }, tema: D.config.tema }), jornadas: [], tanqueos: [], pozo: [] };
    await DB.reemplazarTodo(vacio);
    D = clonar(vacio); recalcular();
    toast('🗑️ Datos borrados');
    location.hash = '#/inicio'; pintar();
  };

  function vAyuda() {
    const h = `<div class="caja"><h3 style="margin-top:0;color:var(--texto)">📲 Instalar en Android</h3><ol style="padding-left:20px;margin:0">
      <li>Abre el enlace de la app en <b>Chrome</b>.</li><li>Toca los <b>tres puntos ⋮</b> arriba a la derecha.</li><li>Toca <b>«Agregar a la pantalla principal»</b> o <b>«Instalar aplicación»</b>.</li>
      <li>Confirma. Aparece el ícono <b>Mi Balance</b> como cualquier app.</li><li>Ábrela una vez con internet; después funciona sin conexión.</li></ol></div>
      <div class="caja"><h3 style="margin-top:0;color:var(--texto)">🧮 Cómo reparte cada jornada oficial</h3><p>1. ⛽ Combustible = km reales × costo por km (real del intervalo si ya cerró; si no, provisional).</p><p>2. 🐷 Ahorro fijo por jornada oficial.</p><p>3. 🚗 Lo que queda de los primeros $100.000 va a la cuota.</p><p>4. 💧 Lo que pasa de la meta va al Pozo.</p><p>5. Si no llegas a la meta, el Pozo puede apoyar (primero combustible, luego ahorro, luego cuota) <b>solo si tú confirmas</b>.</p><p>Martes y domingos trabajados: todo al Pozo. Novedad: el Pozo puede cubrir lo que un día normal habría dejado.</p></div>
      <div class="caja"><h3 style="margin-top:0;color:var(--texto)">❄️ El aire acondicionado</h3><p>Con las horas con y sin aire de cada tramo, la gasolina de cada intervalo se reparte entre los días: un km con aire pesa ${F.num(C.cfg.aireConsumeMas)} % más. Así los días con más aire cargan más combustible, y la suma siempre da lo que pagaste.</p></div>
      <div class="caja"><h3 style="margin-top:0;color:var(--texto)">💾 Tus datos</h3><p>Se guardan solo en este teléfono. No se sincronizan con otros equipos. Descarga un respaldo cada semana (Más → Respaldo) y guárdalo en Drive o en tu correo.</p></div>`;
    return { titulo: 'Cómo funciona', atras: true, nav: 'mas', html: h };
  }

  // ================================================================ ARRANQUE
  function registrarSW() {
    if (!('serviceWorker' in navigator)) return;
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (location.protocol !== 'https:' && !(local && /[?&]sw=1/.test(location.search))) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      swReg = reg;
      const mostrar = () => $('#actualizar').classList.add('ver');
      if (reg.waiting && navigator.serviceWorker.controller) mostrar();
      reg.addEventListener('updatefound', () => { const n = reg.installing; if (n) n.addEventListener('statechange', () => { if (n.state === 'installed' && navigator.serviceWorker.controller) mostrar(); }); });
    }).catch(e => console.warn('Sin modo sin conexión:', e));
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recargando) { recargando = true; location.reload(); } });
  }
  ACC.actualizarApp = () => { if (swReg && swReg.waiting) swReg.waiting.postMessage('actualizar'); else location.reload(); };

  async function iniciar() {
    try {
      await DB.abrir();
      D = await DB.cargar();
    } catch (e) {
      $('#vista').innerHTML = `<div class="caja alerta"><p><b>No se pudo abrir el almacenamiento del teléfono.</b></p><p>${esc(e.message)}</p><p class="peq">Si estás en una ventana de incógnito, ábrelo en una ventana normal.</p></div>`;
      return;
    }
    // Primera vez en este teléfono: arranca vacía. Los datos de Edwin llegan con «Restaurar respaldo»
    // (así sus cifras nunca quedan publicadas dentro de la aplicación).
    if (!D.config) {
      D = { config: Object.assign({}, Calc.CONFIG_INICIAL), jornadas: [], tanqueos: [], pozo: [] };
      await DB.reemplazarTodo(D);
    }
    D.config = Object.assign({}, Calc.CONFIG_INICIAL, D.config);
    document.documentElement.dataset.tema = D.config.tema || 'oscuro';
    try { localStorage.setItem('mb-tema', D.config.tema || 'oscuro'); } catch (e) { /* no pasa nada */ }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(ok => { persistente = ok; }).catch(() => {});
    recalcular();
    // Si la app queda abierta y cambia el día, se recalcula al volver a ella.
    document.addEventListener('visibilitychange', () => { if (!document.hidden && C.hoy !== Calc.hoy()) { recalcular(); pintar(); } });
    window.addEventListener('hashchange', pintar);
    pintar();
    registrarSW();
  }
  window.addEventListener('error', e => toast('❌ ' + (e.message || 'Error'), true));
  iniciar();
  window.__miBalance = { get D() { return D; }, get C() { return C; } };   // solo para revisar desde la consola
})();

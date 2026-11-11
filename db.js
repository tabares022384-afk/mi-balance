// Mi Balance — almacenamiento en el teléfono (IndexedDB). Cada registro se guarda apenas se confirma
// y sigue ahí al cerrar el navegador. No hay sincronización con otros equipos: para pasar los datos se usa el respaldo.
(function () {
  'use strict';
  const NOMBRE = 'mi-balance', VERSION = 1;
  const TIENDAS = { jornadas: 'fecha', tanqueos: 'id', pozo: 'id', config: 'clave' };
  let db = null;

  function abrir() {
    return new Promise((ok, mal) => {
      if (!window.indexedDB) return mal(new Error('Este navegador no permite guardar datos (IndexedDB)'));
      const r = indexedDB.open(NOMBRE, VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const t in TIENDAS) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: TIENDAS[t] });
      };
      r.onsuccess = () => { db = r.result; ok(db); };
      r.onerror = () => mal(r.error);
      r.onblocked = () => mal(new Error('Cierra las otras pestañas de Mi Balance y vuelve a abrir'));
    });
  }

  function tx(tiendas, modo, trabajo) {
    return new Promise((ok, mal) => {
      const t = db.transaction(tiendas, modo);
      let salida;
      t.oncomplete = () => ok(salida);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error || new Error('No se pudo guardar'));
      salida = trabajo(t);
    });
  }

  function todos(t, tienda) {
    return new Promise((ok, mal) => { const r = t.objectStore(tienda).getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
  }

  async function cargar() {
    const t = db.transaction(Object.keys(TIENDAS), 'readonly');
    const [jornadas, tanqueos, pozo, config] = await Promise.all(['jornadas', 'tanqueos', 'pozo', 'config'].map(n => todos(t, n)));
    const c = config.find(x => x.clave === 'config');
    if (c) delete c.clave;
    return { config: c || null, jornadas, tanqueos, pozo };
  }

  // Guarda y borra en UNA sola operación: o queda todo o no queda nada.
  function aplicar(cambios) {
    return tx(Object.keys(TIENDAS), 'readwrite', t => {
      for (const c of cambios) {
        const s = t.objectStore(c.tienda);
        if (c.borrar !== undefined) s.delete(c.borrar);
        else s.put(c.tienda === 'config' ? Object.assign({ clave: 'config' }, c.dato) : c.dato);
      }
    });
  }

  function reemplazarTodo(datos) {
    return tx(Object.keys(TIENDAS), 'readwrite', t => {
      for (const n in TIENDAS) t.objectStore(n).clear();
      t.objectStore('config').put(Object.assign({ clave: 'config' }, datos.config));
      for (const j of datos.jornadas) t.objectStore('jornadas').put(j);
      for (const x of datos.tanqueos) t.objectStore('tanqueos').put(x);
      for (const m of datos.pozo) t.objectStore('pozo').put(m);
    });
  }

  window.DB = { abrir, cargar, aplicar, reemplazarTodo };
})();

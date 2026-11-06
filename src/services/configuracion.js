import "dotenv/config";
import fetch from "node-fetch";

/**
 * Módulo central de configuración (tabla CONSULTAS_CONF_RDA).
 *
 * Toda la app debe obtener los datos de conexión desde aquí:
 *
 *   import { getConfig } from '../services/configuracion.js';
 *   const cfg = await getConfig();
 *   cfg.clientId, cfg.clientSecret, cfg.scope, cfg.tenantId,
 *   cfg.subscriptionKey, cfg.url, cfg.ambiente, cfg.id
 *
 * La consulta se hace una sola vez y queda en caché. Si falla, el siguiente
 * llamado vuelve a intentarlo (no se cachea el error).
 *
 * Variables de entorno opcionales:
 *   CONFIG_URL → endpoint del servicio de configuración (default http://localhost:3002/Configuracion)
 *   AMBIENTE   → se envía como ?ambiente= para elegir la fila de la tabla
 *   CONFIG_ID  → se envía como ?id=      para elegir la fila de la tabla
 */

const CONFIG_URL = process.env.CONFIG_URL || "http://localhost:3002/Configuracion";

// Tiempo que se reutiliza la configuración antes de volver a consultar la tabla.
// Así un cambio en CONSULTAS_CONF_RDA se aplica sin reiniciar (default 60 s).
const CONFIG_TTL_MS = Number(process.env.CONFIG_TTL_MS ?? 60000);

let cache = null;      // configuración ya cargada
let cargadaEn = 0;     // momento de la última carga
let enCurso = null;    // promesa de carga en curso (evita consultas simultáneas)

function construirUrl() {
  const params = new URLSearchParams();
  if (process.env.AMBIENTE) params.set("ambiente", process.env.AMBIENTE);
  if (process.env.CONFIG_ID) params.set("id", process.env.CONFIG_ID);
  const qs = params.toString();
  return qs ? `${CONFIG_URL}?${qs}` : CONFIG_URL;
}

function normalizar(datos) {
  return Object.freeze({
    id: datos.ID,
    clientId: datos.CLIENTE_ID,
    clientSecret: datos.CLIENTE_SECRET,
    scope: datos.SCOPE,
    ambiente: datos.AMBIENTE,
    subscriptionKey: datos.SUBSCRIPTIONKEY,
    tenantId: datos.TENANTID,
    estado: datos.ESTADO,
    url: (datos.URL || "").replace(/\/+$/, ""), // sin "/" final
  });
}

async function cargar() {
  const resp = await fetch(construirUrl());
  if (!resp.ok) {
    throw new Error(`Error cargando configuración (HTTP ${resp.status})`);
  }
  const data = await resp.json();
  if (!data?.datos) {
    throw new Error("Config inválida: no existe 'datos'");
  }
  return normalizar(data.datos);
}

/**
 * Devuelve la configuración activa (cacheada).
 */
export async function getConfig() {
  if (cache && Date.now() - cargadaEn < CONFIG_TTL_MS) return cache;
  if (!enCurso) {
    enCurso = cargar()
      .then((cfg) => {
        if (!cache || cache.id !== cfg.id || cache.url !== cfg.url) {
          console.log(`⚙️ Configuración activa: ID=${cfg.id} AMBIENTE=${cfg.ambiente} URL=${cfg.url}`);
        }
        cache = cfg;
        cargadaEn = Date.now();
        return cfg;
      })
      .catch((err) => {
        // Si ya había una configuración, se sigue usando mientras el servicio vuelve
        if (cache) {
          console.warn("⚠️ No se pudo refrescar la configuración, se usa la anterior:", err.message);
          return cache;
        }
        throw err;
      })
      .finally(() => (enCurso = null));
  }
  return enCurso;
}

/**
 * Datos no sensibles de la configuración activa (para diagnóstico).
 */
export async function resumenConfig() {
  const cfg = await getConfig();
  return { id: cfg.id, ambiente: cfg.ambiente, url: cfg.url, estado: cfg.estado };
}

/**
 * Fuerza recargar la configuración desde la base de datos.
 */
export async function recargarConfig() {
  cargadaEn = 0;
  return getConfig();
}

/**
 * Completa credenciales faltantes con las de la configuración.
 * Permite que el frontend ya no tenga que enviarlas.
 */
export async function resolverCredenciales({ clientId, clientSecret, subscriptionKey } = {}) {
  const cfg = await getConfig();
  return {
    clientId: clientId || cfg.clientId,
    clientSecret: clientSecret || cfg.clientSecret,
    subscriptionKey: subscriptionKey || cfg.subscriptionKey,
  };
}

export default { getConfig, recargarConfig, resolverCredenciales, resumenConfig };

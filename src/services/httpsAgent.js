import fetch from "node-fetch";
import https from "https";

/**
 * Servicio para manejar la autenticación OAuth2
 */

async function cargarConfig() {
  const resp = await fetch("http://localhost:3002/Configuracion");
  if (!resp.ok) throw new Error("Error cargando configuración");

  const data = await resp.json();
  //console.log("Respuesta backend:", data); // 👀 ver estructura real
  return data;
}

class HttpsAgent {
  constructor(config) {
    if (!config || !config.datos) {
      throw new Error("Config inválida: no existe 'datos'");
    }

    const datos = config.datos;

    this.clientId = datos.CLIENTE_ID;
    this.clientSecret = datos.CLIENTE_SECRET;
    this.tenantId = datos.TENANTID;
    this.scope = datos.SCOPE;
    this.subscriptionKey = datos.SUBSCRIPTIONKEY;

    this.agent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  async getAccessToken() {
    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "client_credentials",
        scope: this.scope,
      }),
    });

    const tokenData = await response.json();
    if (!tokenData.access_token) {
      throw new Error(
        "No se pudo obtener el token de acceso: " + JSON.stringify(tokenData)
      );
    }

    return tokenData.access_token;
  }

  async authenticatedRequest(url, token, subscriptionKey, options = {}) {
    const defaultHeaders = {
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      Accept: "application/json",
    };

    const mergedOptions = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
      agent: this.agent,
    };

    return fetch(url, mergedOptions);
  }

  async authenticatedRequestPOST(url, token, subscriptionKey, body) {
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      agent: this.agent,
    });
  }
}

// ⚡ Inicializa la instancia antes de exportar
let httpsAgent;

try {
  const config = await cargarConfig();   // carga datos de la BD
  httpsAgent = new HttpsAgent(config);   // crea la instancia con config.datos
} catch (err) {
  console.error("Error cargando configuración:", err);
  httpsAgent = new HttpsAgent({
    datos: {
      CLIENTE_ID: "",
      CLIENTE_SECRET: "",
      TENANTID: "",
      SCOPE: "",
      SUBSCRIPTIONKEY: ""
    }
  });
}

export default httpsAgent;

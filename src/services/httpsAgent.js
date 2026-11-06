import fetch from "node-fetch";
import https from "https";
import { getConfig } from "./configuracion.js";

/**
 * Servicio para manejar la autenticación OAuth2.
 * Los datos (tenant, client, scope, subscription key) vienen de
 * CONSULTAS_CONF_RDA a través de ./configuracion.js
 */
class HttpsAgent {
  constructor() {
    this.agent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  async getAccessToken() {
    const cfg = await getConfig();
    const tokenUrl = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "client_credentials",
        scope: cfg.scope,
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
    const key = subscriptionKey || (await getConfig()).subscriptionKey;
    const defaultHeaders = {
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": key,
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
    const key = subscriptionKey || (await getConfig()).subscriptionKey;
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      agent: this.agent,
    });
  }
}

const httpsAgent = new HttpsAgent();

export default httpsAgent;

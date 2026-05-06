import express from 'express';
import httpsAgent from '../services/httpsAgent.js';

const router = express.Router();

/**
 * Servicio para manejo de recursos FHIR
 */
class FHIRService {
  constructor() {
    this.baseUrl = 'https://sandbox.ihcecol.gov.co/ihce';
  }

  /**
   * Valida credenciales requeridas
   */
  validateCredentials(clientId, clientSecret, subscriptionKey) {
    if (!clientId || !clientSecret || !subscriptionKey) {
      throw new Error('Faltan credenciales: clientId, clientSecret, subscriptionKey son requeridos');
    }
  }

  /**
   * Acceso a token
   */
  async getToken(clientId, clientSecret) {
    return httpsAgent.getAccessToken(clientId, clientSecret);
  }

  /**
   * Hace request autenticado (GET)
   */
  async authenticatedRequest(endpointOrUrl, clientId, clientSecret, subscriptionKey, options = {}) {
    this.validateCredentials(clientId, clientSecret, subscriptionKey);
    const token = await this.getToken(clientId, clientSecret);
    const url = endpointOrUrl.startsWith('http')
      ? endpointOrUrl
      : `${this.baseUrl}/${endpointOrUrl}`;
    return httpsAgent.authenticatedRequest(url, token, subscriptionKey, options);
  }

  /**
   * Hace request autenticado (POST)
   */
  async authenticatedPOST(endpoint, clientId, clientSecret, subscriptionKey, body) {
    this.validateCredentials(clientId, clientSecret, subscriptionKey);
    const token = await this.getToken(clientId, clientSecret);
    const url = `${this.baseUrl}/${endpoint}`;
    return httpsAgent.authenticatedRequestPOST(url, token, subscriptionKey, body);
  }

  /**
   * Busca DocumentReference por tipo/número de documento (si lo necesitas)
   */
  async buscarDocumentos(tipoDocumento, documento, clientId, clientSecret, subscriptionKey) {
    const searchParams = new URLSearchParams({
      identifier: `${tipoDocumento}|${documento}`,
      _format: 'json'
    });

    const response = await this.authenticatedRequest(
      `DocumentReference?${searchParams.toString()}`,
      clientId, clientSecret, subscriptionKey
    );

    if (!response.ok) {
      throw new Error(`Error en búsqueda de documentos: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Obtiene un recurso por tipo e ID
   */
  async obtenerRecurso(resourceType, resourceId, clientId, clientSecret, subscriptionKey) {
    const response = await this.authenticatedRequest(
      `${resourceType}/${resourceId}`,
      clientId, clientSecret, subscriptionKey
    );

    if (!response.ok) {
      throw new Error(`Error obteniendo ${resourceType}: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Busca recursos con parámetros
   */
  async buscarRecursos(resourceType, searchParams, clientId, clientSecret, subscriptionKey) {
    const queryParams = new URLSearchParams(searchParams);
    const response = await this.authenticatedRequest(
      `${resourceType}?${queryParams.toString()}`,
      clientId, clientSecret, subscriptionKey
    );

    if (!response.ok) {
      throw new Error(`Error buscando ${resourceType}: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Consulta RDA para paciente
   */
  async consultarRDAPaciente(payload, clientId, clientSecret, subscriptionKey) {
    const response = await this.authenticatedPOST(
      'Composition/$consultar-rda-paciente',
      clientId, clientSecret, subscriptionKey, payload
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Error del servidor FHIR (paciente): ${response.status} ${response.statusText} - ${errorBody}`);
    }
    return response.json();
  }

  /**
   * Consulta RDA para encuentros clínicos
   */
  async consultarRDAEncuentros(payload, clientId, clientSecret, subscriptionKey) {
    const response = await this.authenticatedPOST(
      'Composition/$consultar-rda-encuentros-clinicos',
      clientId, clientSecret, subscriptionKey, payload
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Error del servidor FHIR (encuentros): ${response.status} ${response.statusText} - ${errorBody}`);
    }
    return response.json();
  }

  /**
   * Consulta ambas RDA (paciente y encuentros) en paralelo
   */
  async consultarRDACompleto(payload, clientId, clientSecret, subscriptionKey) {
   

    const [resultPaciente, resultEncuentros] = await Promise.allSettled([
      this.consultarRDAPaciente(payload, clientId, clientSecret, subscriptionKey),
      this.consultarRDAEncuentros(payload, clientId, clientSecret, subscriptionKey)
    ]);

    const response = {
      paciente: {
        status: resultPaciente.status,
        data: resultPaciente.status === 'fulfilled' ? resultPaciente.value : null,
        error: resultPaciente.status === 'rejected' ? resultPaciente.reason.message : null
      },
      encuentros: {
        status: resultEncuentros.status,
        data: resultEncuentros.status === 'fulfilled' ? resultEncuentros.value : null,
        error: resultEncuentros.status === 'rejected' ? resultEncuentros.reason.message : null
      }
    };

    
    return response;
  }

  /**
   * Extrae todas las referencias de los Compositions del Bundle dado
   * Evita duplicados usando Set
   */
  extractReferences(compositionBundle) {
    const allReferences = new Set();
    if (!compositionBundle.entry) return allReferences;

    compositionBundle.entry.forEach(entry => {
      if (entry.resource?.resourceType === 'Composition') {
        const comp = entry.resource;

        [comp.subject?.reference, comp.encounter?.reference, comp.custodian?.reference]
          .filter(Boolean)
          .forEach(ref => allReferences.add(ref));

        // Autores / attesters
        (comp.author || [])
          .map(a => a.reference)
          .filter(Boolean)
          .forEach(ref => allReferences.add(ref));
        (comp.attester || [])
          .map(a => a.party?.reference)
          .filter(Boolean)
          .forEach(ref => allReferences.add(ref));

        // Secciones → entries
        (comp.section || [])
          .flatMap(section => section.entry || [])
          .map(e => e.reference)
          .filter(Boolean)
          .forEach(ref => allReferences.add(ref));
      }
    });

    return allReferences;
  }

  /**
   * Obtiene un recurso individual desde una referencia FHIR
   */
  async fetchSingleResource(reference, token, subscriptionKey) {
    const resourceUrl = reference.startsWith('http') ? reference : `${this.baseUrl}/${reference}`;
    const response = await httpsAgent.authenticatedRequest(resourceUrl, token, subscriptionKey);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Categoriza recursos por tipo
   */
  /**
   * Categoriza recursos por tipo y DEDUPLICA por id
   */
  categorizeResource(resource, referencedResources) {
    if (!resource) return;

    const typeMap = {
      Patient: 'patients',
      Encounter: 'encounters',
      Practitioner: 'practitioners',
      PractitionerRole: 'practitionerRoles',
      Organization: 'organizations',
      Location: 'locations',
      Condition: 'conditions',
      AllergyIntolerance: 'allergyIntolerances',
      MedicationStatement: 'medicationStatements',
      MedicationAdministration: 'medicationAdministrations',
      MedicationRequest: 'medicationRequests',
      FamilyMemberHistory: 'familyMemberHistories',
      Procedure: 'procedures',
      Observation: 'observations',
      RiskAssessment: 'riskAssessments',
      ServiceRequest: 'serviceRequests',
      DocumentReference: 'documentReferences'
    };

    const category = typeMap[resource.resourceType];
    if (category) {
      // Deduplicar: solo agregar si no existe ya (mismo id)
      const exists = referencedResources[category].some(
        existing => existing.id === resource.id
      );
      if (!exists) {
        referencedResources[category].push(resource);
      }
    } else {
      
    }
  }

  /**
   * Obtiene recursos referenciados de un Bundle (Composition searchset)
   * - Evita fetch de recursos ya embebidos en el mismo bundle.
   * - Evita referencias duplicadas.
   */
  async obtenerRecursosReferenciados(compositionBundle, clientId, clientSecret, subscriptionKey) {
    const token = await this.getToken(clientId, clientSecret);
    const referencedResources = {
      patients: [],
      encounters: [],
      practitioners: [],
      practitionerRoles: [],
      organizations: [],
      locations: [],
      conditions: [],
      allergyIntolerances: [],
      medicationStatements: [],
      medicationAdministrations: [],
      medicationRequests: [],
      familyMemberHistories: [],
      procedures: [],
      observations: [],
      riskAssessments: [],
      serviceRequests: [],
    documentReferences: []
    };

    // 0) Indexar recursos ya embebidos en el bundle para no re-consultarlos
    const embeddedIndex = new Map(); // key: `${type}/${id}` -> resource
    if (compositionBundle?.entry?.length) {
      for (const e of compositionBundle.entry) {
        const r = e.resource;
        if (r?.resourceType && r?.id) {
          embeddedIndex.set(`${r.resourceType}/${r.id}`, r);
        }
      }
    }

    // 1) Extraer referencias desde las Composition
    const allReferences = this.extractReferences(compositionBundle);

    // 2) Preparar fetch de las referencias que NO están embebidas
    const fetchPromises = Array.from(allReferences)
      .filter(ref => {
        // Normalizar a "Type/id" para lookup
        if (ref.startsWith('http')) return true; // no se puede evaluar fácil, se intenta fetch
        const key = ref.replace(/^\/*/, ''); // remove leading slash
        return !embeddedIndex.has(key);
      })
      .map(reference =>
        this.fetchSingleResource(reference, token, subscriptionKey)
          .then(resource => this.categorizeResource(resource, referencedResources))
          .catch(error => console.warn(`⚠️ No se pudo obtener recurso ${reference}:`, error.message))
      );

    // 3) Además, categorizar los embebidos (gratis)
    for (const [, resource] of embeddedIndex.entries()) {
      this.categorizeResource(resource, referencedResources);
    }

    await Promise.all(fetchPromises);
    return referencedResources;
  }

  /**
   * Resumen de recursos
   */
  getResourceSummary(resources) {
    return {
      patients: resources.patients.length,
      encounters: resources.encounters.length,
      practitioners: resources.practitioners.length,
      organizations: resources.organizations.length,
      conditions: resources.conditions.length,
      allergies: resources.allergyIntolerances.length,
      medications:
        resources.medicationStatements.length +
        resources.medicationAdministrations.length +
        resources.medicationRequests.length,
      familyHistory: resources.familyMemberHistories.length,
      procedures: resources.procedures.length,
      observations: resources.observations.length,
      locations: resources.locations.length,
      riskAssessments: resources.riskAssessments.length,
      serviceRequests: resources.serviceRequests.length,
    documentReferences: resources.documentReferences.length
    };
  }
}

const fhirService = new FHIRService();

/**
 * Middleware para extraer credenciales
 */
function extractCredentials(req, res, next) {
  const { clientId, clientSecret, subscriptionKey } =
    req.method === 'GET' ? req.query : req.body;

  if (!clientId || !clientSecret || !subscriptionKey) {
    return res.status(400).json({
      error: 'Faltan credenciales: clientId, clientSecret, subscriptionKey son requeridos'
    });
  }

  req.credentials = { clientId, clientSecret, subscriptionKey };
  next();
}

/**
 * Handler genérico para errores
 */
function handleError(error, res, context) {
  console.error(`❌ Error en ${context}:`, error);
  if (error?.message?.includes('404')) {
    return res.status(404).json({ error: `${context} no encontrado` });
  }
  res.status(500).json({
    error: `Error en ${context}`,
    details: error?.message
  });
}

/* ─────────────────────────────
 *           ENDPOINTS GET
 * ───────────────────────────── */

/**
 * GET /composition/:id
 * Obtiene un Composition por ID
 */
router.get('/composition/:id', extractCredentials, async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId, clientSecret, subscriptionKey } = req.credentials;

   
    const composition = await fhirService.obtenerRecurso('Composition', id, clientId, clientSecret, subscriptionKey);

  
    res.json(composition);
  } catch (error) {
    handleError(error, res, 'Composition');
  }
});

/**
 * GET /composition/:id/document
 * Ejecuta operación $document sobre un Composition
 */
router.get('/composition/:id/document', extractCredentials, async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId, clientSecret, subscriptionKey } = req.credentials;


    const response = await fhirService.authenticatedRequest(
      `Composition/${id}/$document`,
      clientId,
      clientSecret,
      subscriptionKey
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error obteniendo $document:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Error obteniendo documento',
        details: errorText
      });
    }

    const documento = await response.json();


    res.json(documento);
  } catch (error) {
    handleError(error, res, 'documento completo ($document)');
  }
});

/**
 * GET /patient/:id
 * Obtiene un Patient por ID
 */
router.get('/patient/:id', extractCredentials, async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId, clientSecret, subscriptionKey } = req.credentials;

    console.log(`👤 Obteniendo Patient ID: ${id}`);
    const paciente = await fhirService.obtenerRecurso('Patient', id, clientId, clientSecret, subscriptionKey);
    res.json(paciente);
  } catch (error) {
    handleError(error, res, 'Patient');
  }
});

/* ─────────────────────────────
 *          ENDPOINTS POST
 * ───────────────────────────── */

/**
 * POST /composition
 * Consulta RDA completa (paciente y encuentros) + recursos referenciados
 * Body esperado:
 * {
 *   "clientId": "...",
 *   "clientSecret": "...",
 *   "subscriptionKey": "...",
 *   "payload": { /* parámetros de la operación RDA */ 
router.post('/composition', async (req, res) => {
  try {
    const { clientId, clientSecret, subscriptionKey, payload } = req.body;

    if (!clientId || !clientSecret || !subscriptionKey) {
      return res.status(400).json({ error: 'Faltan credenciales: clientId, clientSecret, subscriptionKey' });
    }
    if (!payload) {
      return res.status(400).json({ error: 'payload es requerido con los parámetros de búsqueda' });
    }


 

    // Consultar ambas RDA en paralelo
    const rdaResults = await fhirService.consultarRDACompleto(payload, clientId, clientSecret, subscriptionKey);

    // Etiquetar y combinar entries de ambas fuentes
    const allEntries = [];
    const entriesPaciente = [];
    const entriesEncuentros = [];

    // Links de paginación (si llegan en cualquiera de las respuestas)
    let paginationLinks = [];

    if (rdaResults.paciente.status === 'fulfilled' && rdaResults.paciente.data?.entry) {


      if (rdaResults.paciente.data.link?.length) {
        paginationLinks = rdaResults.paciente.data.link;
    
      }

      rdaResults.paciente.data.entry.forEach(entry => {
        const taggedEntry = {
          ...entry,
          _source: 'rda-paciente',
          _sourceLabel: 'RDA de antecedentes manifestados por el paciente'
        };
        allEntries.push(taggedEntry);
        entriesPaciente.push(taggedEntry);
      });
    }

    if (rdaResults.encuentros.status === 'fulfilled' && rdaResults.encuentros.data?.entry) {
   

      if (!paginationLinks.length && rdaResults.encuentros.data.link?.length) {
        paginationLinks = rdaResults.encuentros.data.link;
    
      }

      rdaResults.encuentros.data.entry.forEach(entry => {
        const taggedEntry = {
          ...entry,
          _source: 'rda-encuentros',
          _sourceLabel: 'RDA de encuentros clínicos'
        };
        allEntries.push(taggedEntry);
        entriesEncuentros.push(taggedEntry);
      });
    }

    // Bundle combinado
    const combinedBundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: allEntries.length,
      entry: allEntries
    };


    // Recursos referenciados
    let allReferencedResources = {
      patients: [],
      encounters: [],
      practitioners: [],
      practitionerRoles: [],
      organizations: [],
      locations: [],
      conditions: [],
      allergyIntolerances: [],
      medicationStatements: [],
      medicationAdministrations: [],
      medicationRequests: [],
      familyMemberHistories: [],
      procedures: [],
      observations: [],
      riskAssessments: [],
      serviceRequests: [],
    documentReferences: []
    };

    if (allEntries.length > 0) {
     
      try {
        allReferencedResources = await fhirService.obtenerRecursosReferenciados(
          combinedBundle,
          clientId,
          clientSecret,
          subscriptionKey
        );
      } catch (refError) {
     
        // Continuar sin los recursos referenciados
      }
    }

    // Respuesta completa con datos separados por fuente
    const completeResult = {
      ...combinedBundle,
      link: paginationLinks,
      entriesBySource: {
        paciente: entriesPaciente,
        encuentros: entriesEncuentros
      },
      rdaDetails: {
        paciente: {
          status: rdaResults.paciente.status,
          total: rdaResults.paciente.data?.total || 0,
          entries: entriesPaciente.length,
          error: rdaResults.paciente.error
        },
        encuentros: {
          status: rdaResults.encuentros.status,
          total: rdaResults.encuentros.data?.total || 0,
          entries: entriesEncuentros.length,
          error: rdaResults.encuentros.error
        }
      },
      referencedResources: allReferencedResources,
      summary: {
        totalCompositions: allEntries.filter(e => e.resource?.resourceType === 'Composition').length,
        compositionsPaciente: entriesPaciente.filter(e => e.resource?.resourceType === 'Composition').length,
        compositionsEncuentros: entriesEncuentros.filter(e => e.resource?.resourceType === 'Composition').length,
        ...fhirService.getResourceSummary(allReferencedResources)
      }
    };



    res.json(completeResult);
  } catch (error) {
    console.error('❌ Error en endpoint POST /composition:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /document-metadata
 * Obtener metadatos de un DocumentReference
 */
router.post('/document-metadata', async (req, res) => {
  try {
    const { clientId, clientSecret, subscriptionKey, docId } = req.body;

    if (!clientId || !clientSecret || !subscriptionKey) {
      return res.status(400).json({ error: 'Faltan credenciales: clientId, clientSecret, subscriptionKey' });
    }
    if (!docId) {
      return res.status(400).json({ error: 'Falta parámetro requerido: docId' });
    }

    const result = await fhirService.obtenerRecurso('DocumentReference', docId, clientId, clientSecret, subscriptionKey);
    res.json(result);
  } catch (error) {
    handleError(error, res, 'metadatos del documento');
  }
});

/* ─────────────────────────────
 *  Paginación con acumulación
 * ───────────────────────────── */

const recursosAcumulados = new Map(); // key: patientId o sessionId

/**
 * GET /pagina
 * Params:
 *  - url (obligatorio): link.next o link.prev del Bundle
 *  - patientId o sessionId (uno de los dos, para cache/estado)
 */
router.get('/pagina', extractCredentials, async (req, res) => {
  try {
    const { url, patientId, sessionId } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'Falta parámetro requerido: url' });
    }

    const cacheKey = patientId || sessionId;
    if (!cacheKey) {
      return res.status(400).json({
        error: 'Se requiere patientId o sessionId para mantener recursos referenciados entre páginas'
      });
    }

    const token = await httpsAgent.getAccessToken(req.credentials.clientId, req.credentials.clientSecret);

    const response = await httpsAgent.authenticatedRequest(
      url,
      token,
      req.credentials.subscriptionKey
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: 'Error desde servidor FHIR',
        status: response.status,
        details: text
      });
    }

    const bundle = await response.json();

    // 1) Recursos referenciados de ESTA página
    const newReferenced = await fhirService.obtenerRecursosReferenciados(
      bundle,
      req.credentials.clientId,
      req.credentials.clientSecret,
      req.credentials.subscriptionKey
    );

    // 2) Recuperar o inicializar acumulador
    let accumulated = recursosAcumulados.get(cacheKey) || {
      patients: [],
      practitioners: [],
      practitionerRoles: [],
      organizations: [],
      locations: [],
      encounters: [],
      procedures: [],
      medicationAdministrations: [],
      familyMemberHistories: [],
      medicationStatements: [],
      allergyIntolerances: [],
      conditions: [],
      medicationRequests: [],
      observations: [],
      riskAssessments: [],
      serviceRequests: [],
    documentReferences: []
    };

    // 3) Merge sin duplicados por (resourceType,id)
    mergeReferencedResources(accumulated, newReferenced);

    // 4) Guardar estado actualizado
    recursosAcumulados.set(cacheKey, accumulated);

    const completeResult = {
      ...bundle,
      referencedResources: accumulated,
      pageReferencedCount: Object.values(newReferenced).reduce((sum, arr) => sum + arr.length, 0),
      accumulatedCount: Object.values(accumulated).reduce((sum, arr) => sum + arr.length, 0)
    };


    res.json(completeResult);
  } catch (error) {
    console.error('❌ Error cargando página:', error);
    res.status(500).json({
      error: 'Error interno al cargar página',
      details: error.message
    });
  }
});

/**
 * Combina dos conjuntos de recursos referenciados evitando duplicados por (resourceType,id)
 */
function mergeReferencedResources(target, source) {
  for (const [key, newItems] of Object.entries(source || {})) {
    if (!target[key]) target[key] = [];
    newItems.forEach(newItem => {
      const exists = target[key].some(
        existing => existing.id === newItem.id && existing.resourceType === newItem.resourceType
      );
      if (!exists) target[key].push(newItem);
    });
  }
}

export default router;
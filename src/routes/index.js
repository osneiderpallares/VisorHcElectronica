    import express from 'express';
    import fhirService from '../services/services.js';
    import httpsAgent from '../services/httpsAgent.js';


    const router = express.Router();





/**
     * Endpoint para obtener resumen inmunizacion de paciente
     */

/**
 * POST /api/inmunizacion
 * Body:
 * {
 *   "clientId": "...",           // opcional si el agente usa los suyos internos
 *   "clientSecret": "...",       // opcional idem
 *   "subscriptionKey": "...",    // requerido si tu APIM lo exige
 *   "payload": {
 *     "resourceType": "Parameters",
 *     "parameter": [{
 *       "name": "identifier",
 *       "part": [
 *         { "name": "type", "valueString": "CC" },
 *         { "name": "value", "valueString": "1022423800" }
 *       ]
 *     }]
 *   }
 * }
 */
router.post('/inmunizacion', async (req, res) => {
    try {
      const { subscriptionKey, payload } = req.body || {};
  
      if (!payload?.parameter) {
        return res.status(400).json({ error: 'payload (Parameters) es requerido' });
      }
  
      const API_BASE = process.env.IHCE_API_BASE || 'https://sandbox.ihcecol.gov.co/ihce';
      const url = `${API_BASE}/Immunization/$consultar-inmunizacion`;
  
      // 1) Obtener token con TU agente (usa sus propios clientId/clientSecret)
      const token = await httpsAgent.getAccessToken();
  
      // 2) Hacer POST autenticado
      const response = await httpsAgent.authenticatedRequest(
        url,
        token,
        subscriptionKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
  
      const text = await response.text();
      let data = null; try { data = JSON.parse(text); } catch {}
  
      if (!response.ok) {
        const detalle = data?.message || data?.error || text || `HTTP ${response.status}`;
        return res.status(response.status).json({ error: detalle });
      }
  
      // (Opcional) etiquetar entries para trazabilidad
      if (data?.entry?.length) {
        data.entry = data.entry.map(e => ({ ...e, _source: 'inmunizacion', _sourceLabel: 'Registro de inmunización' }));
      }
  
      return res.json(data);
    } catch (error) {
      console.error('❌ Error en /api/inmunizacion:', error);
      return res.status(500).json({ error: 'Error interno consultando inmunización', details: error.message });
    }
  });

/**
 * GET - Obtener página específica de resultados
 */
router.get('/composition/pagina', async (req, res) => {
    try {
        const { url, clientId, clientSecret, subscriptionKey } = req.query;

        if (!url) {
            return res.status(400).json({ error: 'URL es requerida' });
        }

        console.log('📄 Obteniendo página:', url);

        const token = await httpsAgent.getAccessToken(clientId, clientSecret);
        const response = await httpsAgent.authenticatedRequest(url, token, subscriptionKey);

        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Etiquetar entries con origen
        if (data.entry) {
            data.entry = data.entry.map(entry => ({
                ...entry,
                _source: 'rda-paciente', // Ajustar según corresponda
                _sourceLabel: 'RDA de antecedentes manifestados por el paciente'
            }));
        }

        res.json(data);

    } catch (error) {
        console.error('❌ Error obteniendo página:', error);
        res.status(500).json({ 
            error: 'Error obteniendo página',
            details: error.message 
        });
    }
});





    /**
     * Endpoint para obtener resumen longitudinal de paciente
     */
    router.post('/fhir-summary', async (req, res) => {
        try {
            const { clientId, clientSecret, subscriptionKey, patientId } = req.body;
            
            if (!clientId || !clientSecret || !subscriptionKey || !patientId) {
                return res.status(400).json({ 
                    error: 'Faltan parámetros requeridos: clientId, clientSecret, subscriptionKey, patientId' 
                });
            }

            const result = await fhirService.getPatientSummary(
                patientId, 
                clientId, 
                clientSecret, 
            
            );
            
            res.json(result);
        } catch (error) {
            console.error('Error en fhir-summary:', error);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Endpoint para buscar pacientes similares
     */
    router.post('/query-patient', async (req, res) => {
        try {
            const { clientId, clientSecret, subscriptionKey, idType, idValue, given, family } = req.body;
            
            if (!clientId || !clientSecret || !subscriptionKey || !idType || !idValue) {
                return res.status(400).json({ 
                    error: 'Faltan parámetros requeridos: clientId, clientSecret, subscriptionKey, idType, idValue' 
                });
            }

            const searchParams = { idType, idValue, given, family };
            const result = await fhirService.queryPatient(
                searchParams, 
                clientId, 
                clientSecret, 
            
            );
            
            res.json(result);
        } catch (error) {
            console.error('Error en query-patient:', error);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Endpoint para obtener RDAs de paciente
     */
    router.post('/patient-rda', async (req, res) => {
        try {
            const { clientId, clientSecret, subscriptionKey, patientId } = req.body;
            
            if (!clientId || !clientSecret || !subscriptionKey || !patientId) {
                return res.status(400).json({ 
                    error: 'Faltan parámetros requeridos: clientId, clientSecret, subscriptionKey, patientId' 
                });
            }

            const result = await fhirService.getPatientRdas(
                patientId, 
                clientId, 
                clientSecret, 
            
            );
            
            res.json(result);
        } catch (error) {
            console.error('Error en patient-rda:', error);
            res.status(500).json({ error: error.message });
        }
    });





/**
 * Endpoint para enviar RDA de consulta
 */
router.post('/consulta-rda', async (req, res) => {
    try {
        const { clientId, clientSecret, subscriptionKey, body } = req.body;
        
        if (!clientId || !clientSecret || !subscriptionKey || !body) {
            return res.status(400).json({ 
                error: 'Faltan parámetros requeridos: clientId, clientSecret, subscriptionKey, body' 
            });
        }

        const result = await fhirService.enviarRDAConsulta(
            body,
            clientId,
            clientSecret,
            subscriptionKey
        );
        
        res.json(result);
    } catch (error) {
        console.error('Error en consulta-rda:', error);
        res.status(500).json({ error: error.message });
    }
});










    /**
     * Endpoint para obtener documento de composición
     */
    router.post('/composition-document', async (req, res) => {
        try {
            const { clientId, clientSecret, subscriptionKey, compositionId } = req.body;
            
            if (!clientId || !clientSecret || !subscriptionKey || !compositionId) {
                return res.status(400).json({ 
                    error: 'Faltan parámetros requeridos: clientId, clientSecret, subscriptionKey, compositionId' 
                });
            }

            const result = await fhirService.getCompositionDocument(
                compositionId, 
                clientId, 
                clientSecret, 
            
            );
            
            res.json(result);
        } catch (error) {
            console.error('Error en composition-document:', error);
            res.status(500).json({ error: error.message });
        }
    });






    export default router;
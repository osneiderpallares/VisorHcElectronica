import { getConfig } from './configuracion.js';

/**
 * Servicio unificado para operaciones FHIR
 * La URL base viene de CONSULTAS_CONF_RDA (columna URL).
 */
class FHIRService {
    async getBaseUrl() {
        return (await getConfig()).url;
    }
}

// Exportar instancia única (Singleton)
export default new FHIRService();

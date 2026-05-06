

/**
 * Servicio unificado para operaciones FHIR
 */
class FHIRService {
    constructor() {
        this.baseUrls = {
            prod: 'https://sandbox.ihcecol.gov.co/ihce',
            dev: 'https://dev-fevrips.sispro.gov.co/ihce-ahds'
        };
        this.baseUrl = this.baseUrls.dev; // Default a producción
    }

}

// Exportar instancia única (Singleton)
export default new FHIRService();
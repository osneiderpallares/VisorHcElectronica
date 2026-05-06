# FHIR API Server - Sistema RDA Colombia

Servidor Express modularizado para integración con servicios FHIR del Ministerio de Salud de Colombia. Proporciona acceso completo a los Registros de Datos de Atención (RDA) con soporte para múltiples tipos de recursos FHIR.

## Estructura del Proyecto

```
  proyecto/
  ├── index.js                      # Servidor principal
  ├── package.json                  # Dependencias y scripts
  ├── services/
  │   ├── httpsAgent.js            # Servicio de autenticación OAuth2
  │   └── fhir.service.js          # Servicio principal FHIR
  ├── routes/
  │   └── fhir.routes.js           # Rutas FHIR completas
  └── public/
      ├── consultas_rda.html       # Interfaz web principal
      └── consultas_rda_refactored.js  # Lógica frontend con visualización de recursos
  ```

## Instalación

```bash
npm install
```

## Dependencias Principales

- `express`: Framework web
- `node-fetch`: Cliente HTTP
- `cors`: Middleware CORS
- `dotenv`: Gestión de variables de entorno

## Uso

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm start
```

El servidor se ejecuta en `http://localhost:3001` (configurable vía `PORT`)

## Autenticación

Todos los endpoints requieren tres parámetros de autenticación:

- `clientId`: Client ID de Azure AD
- `clientSecret`: Client Secret de Azure AD  
- `subscriptionKey`: Clave de suscripción APIM

**Métodos de envío:**
- `GET`: Query parameters
- `POST`: Body JSON

## Endpoints Principales

### 1. Consulta RDA Dual (Paciente + Encuentros)

#### `POST /api/fhir/composition`
Consulta ambas RDA (paciente y encuentros clínicos) en paralelo y obtiene todos los recursos referenciados.

**Request:**
```json
{
  "clientId": "xxx",
  "clientSecret": "xxx",
  "subscriptionKey": "xxx",
  "payload": {
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "tipoDocumentoIdentificacion",
        "valueCodeableConcept": {
          "coding": [{
            "system": "https://fhir.minsalud.gov.co/rda/CodeSystem/TipoDocumentoIdentificacion",
            "code": "CC"
          }]
        }
      },
      {
        "name": "numeroDocumentoIdentificacion",
        "valueString": "123456789"
      },
      {
        "name": "fechaInicioAtencion",
        "valueDate": "2020-01-01"
      },
      {
        "name": "fechaFinAtencion",
        "valueDate": "2025-12-31"
      }
    ]
  }
}
```

**Response:**
```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 15,
  "entry": [...],
  "entriesBySource": {
    "paciente": [...],
    "encuentros": [...]
  },
  "rdaDetails": {
    "paciente": {
      "status": "fulfilled",
      "total": 8,
      "entries": 8
    },
    "encuentros": {
      "status": "fulfilled",
      "total": 7,
      "entries": 7
    }
  },
  "referencedResources": {
    "patients": [...],
    "encounters": [...],
    "practitioners": [...],
    "practitionerRoles": [...],
    "organizations": [...],
    "locations": [...],
    "conditions": [...],
    "allergyIntolerances": [...],
    "medicationStatements": [...],
    "medicationAdministrations": [...],
    "medicationRequests": [...],
    "familyMemberHistories": [...],
    "procedures": [...],
    "observations": [...],
    "riskAssessments": [...],
    "serviceRequests": [...],
    "documentReferences": [...]
  },
  "summary": {
    "totalCompositions": 15,
    "compositionsPaciente": 8,
    "compositionsEncuentros": 7,
    "patients": 1,
    "encounters": 5,
    "practitioners": 3,
    "organizations": 2,
    "conditions": 12,
    "allergies": 3,
    "medications": 15,
    "familyHistory": 2,
    "procedures": 8,
    "observations": 5,
    "riskAssessments": 2,
    "serviceRequests": 3,
    "documentReferences": 1,
    "locations": 2
  }
}
```

### 2. Obtener Composition Individual

#### `GET /api/fhir/composition/:id`
Obtiene un Composition específico por ID.

**Request:**
```
GET /api/fhir/composition/comp-123?clientId=xxx&clientSecret=xxx&subscriptionKey=xxx
```

### 3. Obtener Documento Completo ($document)

#### `GET /api/fhir/composition/:id/document`
Ejecuta la operación `$document` sobre un Composition, retornando un Bundle con todos los recursos relacionados.

**Request:**
```
GET /api/fhir/composition/comp-123/document?clientId=xxx&clientSecret=xxx&subscriptionKey=xxx
```

### 4. Obtener Patient

#### `GET /api/fhir/patient/:id`
Obtiene un recurso Patient por ID.

**Request:**
```
GET /api/fhir/patient/CC-123456789?clientId=xxx&clientSecret=xxx&subscriptionKey=xxx
```

### 5. Paginación con Acumulación

#### `GET /api/fhir/pagina`
Carga la siguiente/anterior página de resultados manteniendo recursos referenciados acumulados.

**Request:**
```
GET /api/fhir/pagina?url=https://...&patientId=CC-123&clientId=xxx&clientSecret=xxx&subscriptionKey=xxx
```

**Parámetros:**
- `url`: Link `next` o `prev` del Bundle
- `patientId` o `sessionId`: Identificador para mantener el estado entre páginas





## Recursos FHIR Soportados

El sistema procesa y visualiza **17 tipos de recursos FHIR**:

### Recursos Básicos
1. **Patient** - Pacientes
2. **Practitioner** - Profesionales de salud
3. **PractitionerRole** - Roles de profesionales
4. **Organization** - Organizaciones (EPS, IPS)
5. **Location** - Sedes de atención (códigos REPS)

### Recursos Clínicos
6. **Encounter** - Encuentros clínicos (consultas, hospitalizaciones)
7. **Condition** - Diagnósticos (ICD-10)
8. **AllergyIntolerance** - Alergias e intolerancias
9. **Observation** - Observaciones clínicas (incapacidades, ocupación, resultados)
10. **RiskAssessment** - Factores de riesgo

### Recursos de Medicación
11. **MedicationStatement** - Medicamentos reportados
12. **MedicationAdministration** - Administraciones de medicamentos
13. **MedicationRequest** - Órdenes de medicamentos

### Recursos de Procedimientos
14. **Procedure** - Procedimientos realizados (CUPS)
15. **ServiceRequest** - Solicitudes de servicios

### Recursos de Historial
16. **FamilyMemberHistory** - Antecedentes familiares


## Características del Frontend

### Interfaz Web (`consultas_rda.html`)
- Formulario de búsqueda con filtros avanzados
- Tabla de resultados con paginación
- Modal de detalle con visualización completa de recursos
- Descarga de archivos adjuntos (PDFs embebidos o URLs)

### Visualización de Recursos (`consultas_rda_refactored.js`)

**Características:**
- ✅ **17 tipos de recursos** renderizados profesionalmente
- ✅ **Badges dinámicos** de estado con colores semánticos
- ✅ **Filtrado inteligente** por encounter actual
- ✅ **Deduplicación automática** de recursos
- ✅ **Layout responsive** (Bootstrap 5)
- ✅ **Iconos contextuales** (Boxicons)
- ✅ **Formato de fechas** localizado
- ✅ **Escape de HTML** para seguridad
- ✅ **Extensiones MinSalud** completamente soportadas

**Ejemplo de recursos mostrados:**
```
📋 Encounter (Hospitalización)
  ├─ Diagnósticos de ingreso y egreso
  ├─ Información de hospitalización
  └─ Participantes (médicos, tratantes)

🩺 Conditions (Diagnósticos ICD-10)
  ├─ Categoría clínica
  ├─ Verificación
  └─ Severidad

💊 Medications
  ├─ MedicationStatement (reportados)
  ├─ MedicationAdministration (administrados)
  └─ MedicationRequest (órdenes con dosificación)




```

## Arquitectura del Backend

### Servicio FHIR (`fhir.service.js`)

**Métodos principales:**
- `consultarRDAPaciente()` - Consulta RDA de antecedentes
- `consultarRDAEncuentros()` - Consulta RDA de encuentros
- `consultarRDACompleto()` - Consulta ambas en paralelo
- `obtenerRecursosReferenciados()` - Obtiene todos los recursos relacionados
- `categorizeResource()` - Categoriza y deduplica recursos por tipo

**Deduplicación:**
```javascript
categorizeResource(resource, referencedResources) {
  // Solo agrega si no existe (mismo id)
  const exists = referencedResources[category].some(
    existing => existing.id === resource.id
  );
  if (!exists) {
    referencedResources[category].push(resource);
  }
}
```

### Gestión de Referencias

El sistema maneja automáticamente:
- ✅ Recursos embebidos (`contained`)
- ✅ Referencias externas (`reference`)
- ✅ Referencias internas (`#id`)
- ✅ URLs completas del servidor FHIR

## Configuración

### Variables de Entorno

```bash
PORT=3001
NODE_ENV=production
```

### URLs FHIR

**Base URL:**
```
https://test.ihcecol.gov.co/ihce-ahds
```

**Endpoints OAuth2:**
- Token: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- Scope: `api://75ed5ebe-e75a-41a1-aee6-1334d9d0c62f/.default`

## Perfiles MinSalud Soportados

### Compositions
- `CompositionAntecedentesRDA` - Antecedentes del paciente
- `CompositionEpiRDA` - Epicrisis

### Encounters
- `EncounterRDA` - Encuentro clínico completo

### Conditions
- `ConditionRDA` - Diagnósticos

### Allergies
- `AllergyIntoleranceRDA` - Alergias e intolerancias

### Medications
- `MedicationStatementRDA` - Medicamentos reportados
- `MedicationAdministrationRDA` - Administraciones
- `MedicationRequestRDA` - Órdenes de medicamentos

### Procedures
- `ProcedureRDA` - Procedimientos CUPS
- `OtherTechnologyProcedureRDA` - Otras tecnologías

### Observations
- `AttendanceAllowanceRDA` - Incapacidades
- `PatientOccupationAtEncounterRDA` - Ocupación
- `ProcedureResultRDA` - Resultados de procedimientos

### ServiceRequests
- `ServiceRequestRDA` - Solicitudes de servicio



## Extensiones MinSalud

El sistema procesa todas las extensiones del perfil MinSalud:

- `ExtensionDiagnosisType` - Tipo de diagnóstico
- `ExtensionDischargeDeceasedStatus` - Estado al egreso
- `ExtensionRequestDate` - Fecha de solicitud
- `ExtensionSurgicalMethod` - Método quirúrgico
- `ExtensionAllergyVerificationStatus` - Verificación de alergia
- Y más...

## Códigos y Sistemas

### Sistemas de Codificación Soportados
- **ICD-10**: Diagnósticos
- **CUPS**: Procedimientos
- **LOINC**: Documentos y observaciones
- **SNOMED CT**: Términos clínicos
- **ATC**: Medicamentos
- **CIUO**: Ocupaciones

### CodeSystems MinSalud
- `TipoDocumentoIdentificacion`
- `ColombianHealthTechnologyCategory`
- `RIPSFinalidadConsultaVersion2`
- `RIPSCausaExternaVersion2`
- `FactorRiesgo`
- `ColombianDocumentTypes`
- Y más...

## Manejo de Errores

El sistema incluye manejo robusto de errores:

```javascript
// Errores HTTP con contexto
{ 
  "error": "Error en Composition",
  "details": "HTTP 404: Not Found"
}

// Errores de autenticación
{
  "error": "Faltan credenciales",
  "details": "clientId, clientSecret, subscriptionKey son requeridos"
}

// Errores del servidor FHIR
{
  "error": "Error del servidor FHIR (paciente)",
  "status": 500,
  "details": "..."
}
```


## Seguridad

- ✅ Validación de credenciales en todos los endpoints
- ✅ Escape de HTML en visualización
- ✅ CORS configurado
- ✅ Manejo seguro de tokens OAuth2
- ✅ Proxy autenticado para descargas

## Rendimiento

- ✅ Consultas paralelas (RDA paciente + encuentros)
- ✅ Deduplicación automática de recursos
- ✅ Caché de recursos entre páginas
- ✅ Índices para búsquedas rápidas

## Testing

El sistema incluye endpoints de prueba para validación de datos FHIR.

## Migración desde Versiones Anteriores

Los endpoints originales se mantienen compatibles. Nuevos endpoints agregados:

- `/api/fhir/composition` - Consulta dual completa ⭐ **NUEVO**
-
- `/api/fhir/pagina` - Paginación con acumulación ⭐ **NUEVO**

## Soporte

Para reportar problemas o sugerencias, contactar al equipo de desarrollo.

## Licencia

Ministerio de Salud de Colombia - Sistema RDA

---

**Versión:** 2.0.0  
**Última actualización:** Febrero 2025  
**Documentación completa:** Ver código fuente con JSDoc
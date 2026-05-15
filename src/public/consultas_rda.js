// ============================================================================
// CONSULTAS RDA - Sistema de consulta FHIR optimizado
// ============================================================================

// ============================================================================
// 1. CONFIGURACIÓN Y CONSTANTES
// ============================================================================

const CONFIG = {
  clientId: '', 
  clientSecret: '', 
  subscriptionKey: '', 
  apiBaseUrl: 'http://localhost:3001/api',
};

const ROLES_ORG = {
  IPS: 'Organizacion prestadora de salud',
  EPS: 'EPS',
  GENERIC: 'Organización'
};

const ETIQUETAS_PAGINACION = {
  next: '▶️ Siguiente',
  previous: '◀️ Anterior',
  first: '⏮️ Primero',
  last: '⏭️ Último',
  self: '📍 Actual'
};

const TABLA_INMUNIZACIONES_HEADER = `
  <thead>
    <tr>
      <th>#</th><th>Vacuna</th><th>Fecha</th><th>Lote</th>
      <th>Prestador</th><th>Fabricante</th><th>Estado</th>
    </tr>
  </thead>`;

// ============================================================================
// 2. ESTADO GLOBAL
// ============================================================================

const AppState = {
  datosGlobalesFHIR: null,
  datosEncuentrosGlobales: null,
  ultimoBundleInmunizacion: null,

  reset() {
    this.datosGlobalesFHIR = null;
    this.datosEncuentrosGlobales = null;
    this.ultimoBundleInmunizacion = null;
  }
};

// ============================================================================
// 3. UTILIDADES DOM
// ============================================================================

const DOM = {
  byId: (id) => document.getElementById(id),
  qs: (sel) => document.querySelector(sel),

  get elements() {
    return {
      containerPatient: this.byId('accordion-body-patient'),
      contenedor: this.byId('accordion-body-envios'),
      contador: this.byId('contadorDocumentos'),
      contenedorEncuentros: this.byId('accordion-body-encuentros'),
      contadorEncuentros: this.byId('contadorEncuentros'),
      contadorVacunas: this.byId('contadorVacunas'),
      paginacion: this.byId('paginacion'),
      modalContent: this.byId('mostrarCompositions'),
      botonConsulta: this.byId('consultaInfoIhce'),
      inputTipoDocumento: this.byId('inputTipoDocumento'),
      inputDocumento: this.byId('inputDocumento'),
      inputFechaDesde: this.byId('inputFechaDesde'),
      filtroTipoEncuentro: this.byId('filtroTipoEncuentro')
    };
  },

  setBadgeText(id, text) {
    const el = this.byId(id);
    if (el) el.textContent = text;
  },

  setBadgeCount(id, count, { hideWhenZero = true } = {}) {
    const el = this.byId(id);
    if (!el) return;

    const n = Number.isFinite(count) ? count : 0;
    el.textContent = n;
    el.className = 'badge bg-warning';
    el.style.display = (hideWhenZero && n === 0) ? 'none' : 'inline-block';
  }
};

// ============================================================================
// 4. UTILIDADES GENERALES
// ============================================================================

const Utils = {
  safeArray: (arr) => Array.isArray(arr) ? arr : [],
  
  getText: (s) => typeof s === 'string' ? s : '',

  escapeHtml(str) {
    return (str ?? '').toString()
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  },

  formatearFecha(f) {
    if (!f) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(f)) return f.slice(0, 10);
    return f;
  },

  calcularEdad(birthDateStr) {
    if (!birthDateStr) return 'N/A';
    const birth = new Date(birthDateStr);
    if (Number.isNaN(birth.getTime())) return 'N/A';
    
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age < 0 ? 'N/A' : age;
  },

  toText: (v) => v == null ? '' : String(v).trim(),

  field(label, value) {
    const v = this.toText(value);
    return v ? `<p><strong>${label}:</strong> ${this.escapeHtml(v)}</p>` : '';
  }
};

// ============================================================================
// 5. UTILIDADES FHIR
// ============================================================================

const FHIRUtils = {
  ensureRefArrays(ref = {}) {
    return {
      patients: Utils.safeArray(ref.patients),
      practitioners: Utils.safeArray(ref.practitioners),
      organizations: Utils.safeArray(ref.organizations || ref.organization),
      conditions: Utils.safeArray(ref.conditions),
      allergyIntolerances: Utils.safeArray(ref.allergyIntolerances),
      medicationStatements: Utils.safeArray(ref.medicationStatements),
      medicationAdministrations: Utils.safeArray(ref.medicationAdministrations),
      medicationRequests: Utils.safeArray(ref.medicationRequests),
      familyMemberHistories: Utils.safeArray(ref.familyMemberHistories),
      procedures: Utils.safeArray(ref.procedures),
      encounters: Utils.safeArray(ref.encounters),
      practitionerRoles: Utils.safeArray(ref.practitionerRoles),
      locations: Utils.safeArray(ref.locations),
      observations: Utils.safeArray(ref.observations),
      riskAssessments: Utils.safeArray(ref.riskAssessments),
      serviceRequests: Utils.safeArray(ref.serviceRequests),
      documentReferences: Utils.safeArray(ref.documentReferences)
    };
  },

  mergeById(target = [], source = []) {
    const seen = new Set(target.map((x) => x?.id));
    const toAdd = source.filter((x) => x && !seen.has(x.id));
    target.push(...toAdd);
  },

  mergeReferencedResources(globalRef, newRef) {
    const g = this.ensureRefArrays(globalRef);
    const n = this.ensureRefArrays(newRef);
    
    this.mergeById(g.patients, n.patients);
    this.mergeById(g.practitioners, n.practitioners);
    this.mergeById(g.organizations, n.organizations);
    this.mergeById(g.conditions, n.conditions);
    this.mergeById(g.allergyIntolerances, n.allergyIntolerances);
    this.mergeById(g.medicationStatements, n.medicationStatements);
    this.mergeById(g.medicationAdministrations, n.medicationAdministrations);
    this.mergeById(g.medicationRequests, n.medicationRequests);
    this.mergeById(g.familyMemberHistories, n.familyMemberHistories);
    this.mergeById(g.procedures, n.procedures);
    this.mergeById(g.encounters, n.encounters);
    this.mergeById(g.locations, n.locations);
    this.mergeById(g.observations, n.observations);
    
    return g;
  },

  collectSectionReferences(composition) {
    const ids = new Set();
    Utils.safeArray(composition?.section).forEach((sec) => {
      Utils.safeArray(sec?.entry).forEach((e) => {
        const ref = Utils.getText(e?.reference);
        if (ref.includes('/')) {
          const [, id] = ref.split('/');
          if (id) ids.add(id);
        }
      });
    });
    return ids;
  },

  extraerMensajeFHIR(responseJson) {
    try {
      if (!responseJson) return null;
      if (responseJson.resourceType === 'OperationOutcome' && Array.isArray(responseJson.issue)) {
        const texto = responseJson.issue
          .map(i => i.details?.text || i.diagnostics)
          .filter(Boolean)
          .join(' | ');
        return texto || null;
      }
      return null;
    } catch {
      return null;
    }
  },

  getRegionFromOrg(org) {
    if (!org?.address?.[0]) return 'N/A';
    const addr = org.address[0];
    return (
      addr.city ||
      addr.district ||
      addr.state ||
      (Array.isArray(addr.line) ? addr.line.join(', ') : '') ||
      'N/A'
    );
  },

  obtenerOrganizacionDelRDA(recurso, resultado) {
    const ref = Utils.getText(recurso?.custodian?.reference) || 
                Utils.getText(recurso?.attester?.party?.reference);
    
    if (!ref.includes('/')) return null;
    
    const [, orgId] = ref.split('/');
    return resultado?.referencedResources?.organizations?.find((o) => o?.id === orgId) || null;
  }
};

// ============================================================================
// 6. SERVICIOS API
// ============================================================================

const APIService = {
  async consultarComposition(tipoDocumento, documento) {
    if (!Utils.getText(documento).trim()) {
      throw new Error('❌ No se proporcionó un número de documento válido');
    }
    if (!Utils.getText(tipoDocumento).trim()) {
      throw new Error('❌ No se proporcionó un tipo de documento válido');
    }

    const fechaDesde = DOM.elements.inputFechaDesde?.value || '';

    const parametros = {
      clientId: CONFIG.clientId,
      clientSecret: CONFIG.clientSecret,
      subscriptionKey: CONFIG.subscriptionKey,
      payload: {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'identifier',
            part: [
              { name: 'type', valueString: tipoDocumento },
              { name: 'value', valueString: String(documento) }
            ]
          }
        ]
      }
    };

    if (fechaDesde) {
      parametros.payload.parameter.push({ name: 'fechaDesde', valueDate: fechaDesde });
    }

    // console.log('📤 Parámetros enviados:', parametros);

    const response = await fetch(`${CONFIG.apiBaseUrl}/composition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(parametros)
    });

    const responseText = await response.text();

    if (!response.ok) {
      let msg = `Error ${response.status}: ${response.statusText}`;
      try {
        const json = JSON.parse(responseText);
        msg = json.message || json.error || msg;
      } catch {
        msg = responseText || msg;
      }
      throw new Error(msg);
    }

    return JSON.parse(responseText);
  },

  async consultarInmunizacion(tipoDocumento, documento) {
    const resp = await fetch(`${CONFIG.apiBaseUrl}/inmunizacion`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Accept': 'application/json' 
      },
      body: JSON.stringify({
        clientId: CONFIG.clientId,
        clientSecret: CONFIG.clientSecret,
        subscriptionKey: CONFIG.subscriptionKey,
        payload: {
          resourceType: 'Parameters',
          parameter: [{
            name: 'identifier',
            part: [
              { name: 'type', valueString: tipoDocumento },
              { name: 'value', valueString: String(documento) }
            ]
          }]
        }
      })
    });

    let data = null;
    try {
      data = await resp.json();
    } catch (e) {
      throw new Error('Error parseando respuesta del servidor');
    }
    


    // Manejar OperationOutcome
    let operationOutcome = null;
    
    if (data?.error && typeof data.error === 'string') {
      try {
        operationOutcome = JSON.parse(data.error);
      } catch (e) {
        console.error('Error parseando data.error:', e);
      }
    } else if (data?.resourceType === 'OperationOutcome') {
      operationOutcome = data;
    }

    if (operationOutcome?.resourceType === 'OperationOutcome') {
      const issue = operationOutcome.issue?.[0];
      const errorCode = issue?.code;
      const errorText = issue?.details?.text || '';
      
      // Verificar si es "sin registros de vacunas"
      if (errorCode === 'not-found' && 
          (errorText.includes('no tiene registros de aplicación de vacunas') || 
           errorText.includes('PAIWEB-001') ||
           errorText.includes('PAIWEB'))) {
        return { resourceType: 'Bundle', entry: [] };
      }
      
      throw new Error(errorText || 'Error en la consulta');
    }

    if (!resp.ok) {
      throw new Error(`Error HTTP ${resp.status}: ${resp.statusText}`);
    }

    return data;
  },

  async cargarPagina(url, patientId) {
    const queryUrl = 
      `${CONFIG.apiBaseUrl}/pagina` +
      `?url=${encodeURIComponent(url)}` +
      `&clientId=${encodeURIComponent(CONFIG.clientId)}` +
      `&clientSecret=${encodeURIComponent(CONFIG.clientSecret)}` +
      `&subscriptionKey=${encodeURIComponent(CONFIG.subscriptionKey)}` +
      `&patientId=${encodeURIComponent(patientId)}`;

    const response = await fetch(queryUrl);
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Backend ${response.status}: ${text}`);
    }

    return await response.json();
  },

  async consultarConfiguracion(){
    const resp = await fetch('http://localhost:3002/Configuracion');
    if (!resp.ok) throw new Error('Error cargando configuración');
    const CONFI = await resp.json();
    CONFIG.clientId = CONFI.datos.CLIENTE_ID;
    CONFIG.clientSecret = CONFI.datos.CLIENTE_SECRET;
    CONFIG.subscriptionKey = CONFI.datos.SUBSCRIPTIONKEY;
    // console.log('✅ CONFIG cargado:', CONFI.datos);
  },
};

// ============================================================================
// 7. MAPPERS DE DATOS
// ============================================================================

const DataMappers = {
  mapInmunizacion(resource) {
    return {
      vacuna: resource.vaccineCode?.text || resource.vaccineCode?.coding?.[0]?.display || '',
      fecha: resource.occurrenceDateTime || resource.occurrenceString || '',
      lote: resource.lotNumber || '',
      estado: resource.status || '',
      prestador: Utils.safeArray(resource.performer)
        .map(p => p?.actor?.display)
        .filter(Boolean)
        .join(' / ') || '',
      fabricante: resource.manufacturer?.display || ''
    };
  },

  extractInmunizaciones(resourceOrBundle) {
    if (!resourceOrBundle) return [];
    
    const toImmu = [];

    if (resourceOrBundle.resourceType === 'Bundle' && Array.isArray(resourceOrBundle.entry)) {
      for (const e of resourceOrBundle.entry) {
        const r = e?.resource;
        if (r?.resourceType === 'Immunization') toImmu.push(r);
      }
    } else if (resourceOrBundle.resourceType === 'Immunization') {
      toImmu.push(resourceOrBundle);
    }

    return toImmu.map(this.mapInmunizacion);
  },

  mapEncounter(recurso) {
    if (!recurso) return null;

    // type[].coding puede ser objeto directo o array (perfil colombiano MinSalud RDA)
    const getCodingFromType = (t) => {
      const c = t?.coding;
      if (Array.isArray(c)) return c[0];
      if (c && typeof c === 'object') return c;
      return null;
    };

    // Participantes: tipo puede ser objeto {coding:[]} o {coding:{}} segun recurso
    const participantes = Utils.safeArray(recurso?.participant).map(p => {
      const tipoArr = Array.isArray(p?.type?.coding)
        ? p.type.coding
        : (p?.type?.coding ? [p.type.coding] : []);
      const tipoCoding = tipoArr[0];
      return {
        id:         p?.id || '',
        rolCodigo:  tipoCoding?.code    || '',
        rolDisplay: tipoCoding?.display || '',
        referencia: Utils.getText(p?.individual?.reference) || ''
      };
    });

    // Diagnosticos del encuentro con extension de tipo diagnostico
    const diagnosticos = Utils.safeArray(recurso?.diagnosis).map(d => {
      const useCoding = Array.isArray(d?.use?.coding) ? d.use.coding[0] : d?.use?.coding;
      // Extension ExtensionDiagnosisType (tipo: confirmado nuevo, impresion, etc.)
      const extTipo = Utils.safeArray(d?.extension)
        .find(e => Utils.getText(e?.url).includes('ExtensionDiagnosisType'));
      return {
        id:          d?.id || '',
        rank:        d?.rank ?? null,
        rol:         useCoding?.display || useCoding?.code || '',
        rolCodigo:   useCoding?.code    || '',
        tipoDx:      extTipo?.valueCoding?.display || '',
        tipoDxCodigo: extTipo?.valueCoding?.code   || '',
        condicion:   Utils.getText(d?.condition?.reference) || ''
      };
    });

    // Hospitalizacion completa
    const hosp = recurso?.hospitalization;
    const hospitalizacion = hosp ? {
      // ExtensionDischargeDeceasedStatus -> estado de fallecimiento al egreso
      estadoFallecimiento: Utils.safeArray(hosp?.extension)
        .find(e => Utils.getText(e?.url).includes('DischargeDeceasedStatus'))
        ?.valueCoding?.display || '',
      viaIngreso:  hosp?.admitSource?.coding?.[0]?.display           || '',
      viaIngresoCodigo: hosp?.admitSource?.coding?.[0]?.code         || '',
      condicionEgreso: hosp?.dischargeDisposition?.coding?.[0]?.display || '',
      condicionEgresoCodigo: hosp?.dischargeDisposition?.coding?.[0]?.code || '',
      destino:     Utils.getText(hosp?.destination?.reference)       || '',
      reingreso:   hosp?.reAdmission?.coding?.[0]?.display           || ''
    } : null;

    return {
      id:     recurso?.id     || '',
      status: recurso?.status || '',

      // Identificador del encuentro (ej: ADT-HS-9864463-12)
      identificador: recurso?.identifier?.[0]?.value || '',

      // Clase (IMP=inpatient, AMB=ambulatorio, EMER=urgencias)
      clase: {
        codigo:  recurso?.class?.code    || '',
        display: recurso?.class?.display || ''
      },

      // Tipos multiples: modalidad, grupo de servicios, entorno de atencion
      tipos: Utils.safeArray(recurso?.type).map(t => {
        const c = getCodingFromType(t);
        return { codigo: c?.code || '', display: c?.display || '', sistema: c?.system || '' };
      }).filter(t => t.codigo || t.display),

      // Periodo
      periodo: {
        inicio: recurso?.period?.start || '',
        fin:    recurso?.period?.end   || ''
      },

      // Motivos / causa externa (RIPSCausaExternaVersion2)
      motivos: Utils.safeArray(recurso?.reasonCode).map(rc => {
        const c = Array.isArray(rc?.coding) ? rc.coding[0] : rc?.coding;
        return { codigo: c?.code || '', display: c?.display || '', text: rc?.text || '' };
      }),

      // Participantes con rol
      participantes,

      // Diagnosticos con tipo y ranking
      diagnosticos,

      // Hospitalizacion
      hospitalizacion,

      // Ubicaciones
      ubicaciones: Utils.safeArray(recurso?.location).map(l => ({
        display:    l?.location?.display   || '',
        referencia: Utils.getText(l?.location?.reference) || '',
        estado:     l?.status || ''
      })),

      // Prestador (serviceProvider)
      prestador: Utils.getText(recurso?.serviceProvider?.reference) || ''
    };
  },

  extractPatientData(patient) {
    if (!patient) return null;

    const calcularEdad = (birthDateStr) => {
      if (!birthDateStr) return '';
      const hoy = new Date();
      const n = new Date(birthDateStr);
      if (isNaN(n)) return '';
      let e = hoy.getFullYear() - n.getFullYear();
      const m = hoy.getMonth() - n.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e--;
      return e < 0 ? '' : e;
    };

    const tipoDocCoding = patient?.identifier?.[0]?.type?.coding?.find((c) =>
      Utils.getText(c?.system).includes('ColombianPersonIdentifier')
    ) || patient?.identifier?.[0]?.type?.coding?.[0];

    const getExtension = (arr, urlPattern) => 
      arr?.find((e) => Utils.getText(e?.url).includes(urlPattern));

    const address0 = patient?.address?.[0];

    return {
      activo: patient?.active === true,
      fallecido: patient?.deceasedBoolean === true,
      nombres: `${Utils.safeArray(patient?.name?.[0]?.given).join(' ')} ${Utils.getText(patient?.name?.[0]?.family)}`.trim(),
      documento: patient?.identifier?.[0]?.value || '',
      tipoDocumento: tipoDocCoding ? {
        code: Utils.getText(tipoDocCoding?.code)?.toUpperCase() || '',
        display: tipoDocCoding?.display || ''
      } : null,
      fechaNacimiento: Utils.getText(patient?.birthDate) || '',
      horaNacimiento: getExtension(patient?._birthDate?.extension, 'ExtensionBirthTime')?.valueTime || '',
      edad: calcularEdad(patient?.birthDate),
      sexoBiologico: Utils.getText(patient?.gender) || '',
      sexoBiologicoExt: getExtension(patient?._gender?.extension, 'ExtensionBiologicalGender')?.valueCoding?.display || '',
      identidadGenero: getExtension(patient?.extension, 'ExtensionPatientGenderIdentity')?.valueCoding?.display || '',
      nacionalidad: getExtension(patient?.extension, 'ExtensionPatientNationality')?.valueCoding?.display || '',
      etnia: getExtension(patient?.extension, 'ExtensionPatientEthnicity')?.valueCoding?.display || '',
      discapacidad: getExtension(patient?.extension, 'ExtensionPatientDisability')?.valueCoding?.display || '',
      paisResidencia: Utils.getText(address0?.country) || '',
      municipioResidencia: Utils.getText(address0?.city) || '',
      zonaResidencia: getExtension(address0?.extension, 'ExtensionResidenceZone')?.valueCoding?.display || '',
      divipolaMunicipio: getExtension(address0?._city?.extension, 'ExtensionDivipolaMunicipality')?.valueCoding?.code || '',
      codigoPais: getExtension(address0?._country?.extension, 'ExtensionCountryCode')?.valueCoding?.code || ''
    };
  },

  extractPractitionerData(practitioner) {
    if (!practitioner) return null;

    const getExtension = (arr, urlPattern) => 
      arr?.find((e) => Utils.getText(e?.url).includes(urlPattern));

    // Obtener tipo de documento
    const tipoDocCoding = practitioner?.identifier?.[0]?.type?.coding?.find((c) =>
      Utils.getText(c?.system).includes('ColombianPersonIdentifier')
    ) || practitioner?.identifier?.[0]?.type?.coding?.[0];

    // Extraer nombres y apellidos
    const name0 = practitioner?.name?.[0];
    const apellidoPaterno = getExtension(name0?._family?.extension, 'ExtensionFathersFamilyName')?.valueString || '';
    const apellidoMaterno = getExtension(name0?._family?.extension, 'ExtensionMothersFamilyName')?.valueString || '';
    const apellidoCompleto = name0?.family || `${apellidoPaterno} ${apellidoMaterno}`.trim();

    return {
      id: practitioner?.id || '',
      documento: practitioner?.identifier?.[0]?.value || '',
      tipoDocumento: tipoDocCoding ? {
        code: Utils.getText(tipoDocCoding?.code)?.toUpperCase() || '',
        display: tipoDocCoding?.display || ''
      } : null,
      nombres: Utils.safeArray(name0?.given).join(' '),
      apellidos: apellidoCompleto,
      apellidoPaterno: apellidoPaterno,
      apellidoMaterno: apellidoMaterno,
      nombreCompleto: `${Utils.safeArray(name0?.given).join(' ')} ${apellidoCompleto}`.trim(),
      activo: practitioner?.active === true,
      genero: Utils.getText(practitioner?.gender) || '',
      fechaNacimiento: Utils.getText(practitioner?.birthDate) || '',
      telecom: Utils.safeArray(practitioner?.telecom).map(t => ({
        sistema: t?.system || '',
        valor: t?.value || '',
        uso: t?.use || ''
      })),
      direccion: Utils.safeArray(practitioner?.address).map(a => ({
        uso: a?.use || '',
        tipo: a?.type || '',
        lineas: Utils.safeArray(a?.line),
        ciudad: a?.city || '',
        estado: a?.state || '',
        codigoPostal: a?.postalCode || '',
        pais: a?.country || ''
      })),
      // Cualificaciones profesionales
      qualification: Utils.safeArray(practitioner?.qualification).map(q => ({
        identificador: q?.identifier?.[0]?.value || '',
        codigo: q?.code?.coding?.[0]?.code || '',
        display: q?.code?.coding?.[0]?.display || '',
        emisor: q?.issuer?.display || q?.issuer?.reference || '',
        periodo: {
          inicio: q?.period?.start || '',
          fin: q?.period?.end || ''
        }
      })),
      // Foto
      foto: practitioner?.photo?.[0]?.url || '',
      // Idiomas de comunicación
      communication: Utils.safeArray(practitioner?.communication).map(c => 
        c?.coding?.[0]?.display || c?.text || ''
      )
    };
  },

  extractConditionData(condition) {
    if (!condition) return null;

    // Obtener el primer coding de cada campo
    const clinicalStatusCoding = condition?.clinicalStatus?.coding?.[0];
    const verificationStatusCoding = condition?.verificationStatus?.coding?.[0];
    const categoryCoding = condition?.category?.[0]?.coding?.[0];
    const codeCoding = condition?.code?.coding?.[0];
    const severityCoding = condition?.severity?.coding?.[0];

    return {
      id: condition?.id || '',
      
      // Estados
      estadoClinico: {
        codigo: clinicalStatusCoding?.code || '',
        display: clinicalStatusCoding?.display || '',
        sistema: clinicalStatusCoding?.system || ''
      },
      
      estadoVerificacion: {
        codigo: verificationStatusCoding?.code || '',
        display: verificationStatusCoding?.display || '',
        sistema: verificationStatusCoding?.system || ''
      },
      
      // Categoría
      categoria: {
        codigo: categoryCoding?.code || '',
        display: categoryCoding?.display || '',
        sistema: categoryCoding?.system || ''
      },
      
      // Severidad (si existe)
      severidad: severityCoding ? {
        codigo: severityCoding?.code || '',
        display: severityCoding?.display || '',
        sistema: severityCoding?.system || ''
      } : null,
      
      // Código de la condición (diagnóstico)
      codigo: {
        codigo: codeCoding?.code || '',
        display: codeCoding?.display || '',
        sistema: codeCoding?.system || '',
        text: condition?.code?.text || ''
      },
      
      // Parte del cuerpo afectada (si existe)
      bodySite: Utils.safeArray(condition?.bodySite).map(bs => ({
        codigo: bs?.coding?.[0]?.code || '',
        display: bs?.coding?.[0]?.display || '',
        text: bs?.text || ''
      })),
      
      // Sujeto (referencia al paciente)
      sujeto: Utils.getText(condition?.subject?.reference) || '',
      
      // Encuentro relacionado (si existe)
      encounter: Utils.getText(condition?.encounter?.reference) || '',
      
      // Fechas
      fechaInicio: condition?.onsetDateTime || condition?.onsetPeriod?.start || '',
      fechaFin: condition?.abatementDateTime || condition?.abatementPeriod?.end || '',
      fechaRegistro: condition?.recordedDate || '',
      
      // Quién registró
      registradoPor: Utils.getText(condition?.recorder?.reference) || '',
      
      // Quién aseveró/diagnosticó
      aseveradoPor: Utils.getText(condition?.asserter?.reference) || '',
      
      // Etapa de la condición (si existe)
      stage: Utils.safeArray(condition?.stage).map(s => ({
        resumen: s?.summary?.coding?.[0]?.display || s?.summary?.text || '',
        tipo: s?.type?.coding?.[0]?.display || ''
      })),
      
      // Evidencia (si existe)
      evidence: Utils.safeArray(condition?.evidence).map(e => ({
        codigo: e?.code?.[0]?.coding?.[0]?.display || '',
        detalle: Utils.safeArray(e?.detail).map(d => d?.reference || '')
      })),
      
      // Notas
      notas: Utils.safeArray(condition?.note).map(n => n?.text || '').join(' | ')
    };
  },

  extractAllergyData(allergy) {
    if (!allergy) return null;

    // --- En el perfil colombiano (MinSalud RDA) ---
    // • clinicalStatus.coding[0]  → estado clínico (active/resolved/inactive)
    // • verificationStatus        → puede estar ausente
    // • type                      → puede estar ausente
    // • category[]                → puede estar ausente
    // • criticality               → puede estar ausente
    // • code.coding[0]            → TIPO de alergia  (código 01 = "Medicamento")
    // • code.text                 → DESCRIPCIÓN libre ("alergia a penicilina")
    // • patient.reference         → referencia al paciente
    // • encounter.reference       → encuentro relacionado
    // • reaction[]                → reacciones registradas (puede estar ausente)

    const clinicalStatusCoding   = allergy?.clinicalStatus?.coding?.[0];
    const verificationCoding     = allergy?.verificationStatus?.coding?.[0];
    const tipoAlergiaCoding      = allergy?.code?.coding?.[0];   // tipo (ej: Medicamento)
    const descripcionLibre       = allergy?.code?.text || '';     // ej: "alergia a penicilina"

    return {
      id: allergy?.id || '',

      // Estado clínico
      estadoClinico: {
        codigo:  clinicalStatusCoding?.code    || '',
        display: clinicalStatusCoding?.display || ''
      },

      // Estado de verificación (puede no venir)
      estadoVerificacion: verificationCoding ? {
        codigo:  verificationCoding?.code    || '',
        display: verificationCoding?.display || ''
      } : null,

      // Tipo de alergia según TipoAlergia MinSalud  (01=Medicamento, etc.)
      tipoAlergia: {
        codigo:  tipoAlergiaCoding?.code    || '',
        display: tipoAlergiaCoding?.display || '',
        sistema: tipoAlergiaCoding?.system  || ''
      },

      // Descripción libre de la alergia
      descripcion: descripcionLibre,

      // type FHIR (allergy | intolerance) — puede estar ausente
      tipo:       allergy?.type      || '',

      // category[] FHIR (food | medication | environment | biologic) — puede estar ausente
      categorias: Utils.safeArray(allergy?.category),

      // criticality FHIR (low | high | unable-to-assess) — puede estar ausente
      criticidad: allergy?.criticality || '',

      // Referencias
      paciente:  Utils.getText(allergy?.patient?.reference)   || '',
      encounter: Utils.getText(allergy?.encounter?.reference) || '',

      // Fechas
      fechaInicio:   allergy?.onsetDateTime  || allergy?.onsetPeriod?.start || '',
      fechaRegistro: allergy?.recordedDate   || allergy?.meta?.lastUpdated  || '',

      // Profesionales
      registradoPor: Utils.getText(allergy?.recorder?.reference) || '',
      aseveradoPor:  Utils.getText(allergy?.asserter?.reference) || '',

      // Reacciones (puede ser array vacío)
      reacciones: Utils.safeArray(allergy?.reaction).map(r => ({
        sustanciaEspecifica: r?.substance?.coding?.[0]?.display || r?.substance?.text || '',
        manifestaciones: Utils.safeArray(r?.manifestation).map(m =>
          m?.coding?.[0]?.display || m?.text || ''
        ),
        descripcion: r?.description || '',
        inicio:      r?.onset       || '',
        severidad:   r?.severity    || '',   // mild | moderate | severe
        exposicion:  r?.exposureRoute?.coding?.[0]?.display || ''
      })),

      // Notas libres
      notas: Utils.safeArray(allergy?.note).map(n => n?.text || '').join(' | ')
    };
  },

  extractMedicationAdministrationData(med) {
    if (!med) return null;

    // Extensiones colombianas MinSalud RDA
    const getExt = (urlFrag) =>
      Utils.safeArray(med?.extension).find(e =>
        Utils.getText(e?.url).includes(urlFrag)
      );

    const extCantidad = getExt('ExtensionMedicationQuantity'); // cantidad total
    const extDosis    = getExt('ExtensionDoseQuantity');        // forma farmacéutica / dosis

    const medCoding   = med?.medicationCodeableConcept?.coding?.[0];
    const catCoding   = med?.category?.coding?.[0];

    return {
      id:     med?.id     || '',
      status: med?.status || '',

      // Categoría (ColombianHealthTechnologyCategory)
      categoria: {
        codigo:  catCoding?.code    || '',
        display: catCoding?.display || ''
      },

      // Medicamento (código IUM / CUMS)
      medicamento: {
        codigo:  medCoding?.code    || '',
        display: medCoding?.display || '',
        sistema: medCoding?.system  || ''
      },

      // Referencias
      paciente:  Utils.getText(med?.subject?.reference)  || '',
      encuentro: Utils.getText(med?.context?.reference)  || '',   // context = Encounter
      solicitud: Utils.getText(med?.request?.reference)  || '',   // MedicationRequest

      // Fecha de administración
      fechaAdministracion: med?.effectiveDateTime || med?.effectivePeriod?.start || '',

      // Dosificación
      dosage: {
        dosis: med?.dosage?.dose ? {
          valor:   med.dosage.dose.value ?? '',
          unidad:  med.dosage.dose.unit  || '',
          codigo:  med.dosage.dose.code  || ''
        } : null,

        via: med?.dosage?.route?.coding?.[0] ? {
          codigo:  med.dosage.route.coding[0].code    || '',
          display: med.dosage.route.coding[0].display || ''
        } : null,

        frecuencia: med?.dosage?.rateQuantity ? {
          valor:  med.dosage.rateQuantity.value ?? '',
          unidad: med.dosage.rateQuantity.unit  || ''   // "Horas"
        } : null
      },

      // Extensión: cantidad total del medicamento
      cantidadTotal: extCantidad?.valueQuantity ? {
        valor:  extCantidad.valueQuantity.value ?? '',
        unidad: extCantidad.valueQuantity.unit  || '',
        codigo: extCantidad.valueQuantity.code  || ''
      } : null,

      // Extensión: forma farmacéutica / dosis en unidades físicas
      formaFarmaceutica: extDosis?.valueQuantity ? {
        valor:  extDosis.valueQuantity.value ?? '',
        unidad: extDosis.valueQuantity.unit  || '',
        codigo: extDosis.valueQuantity.code  || ''
      } : null,

      // Notas
      notas: Utils.safeArray(med?.note).map(n => n?.text || '').join(' | ')
    };
  },

  extractMedicationRequestData(req) {
    if (!req) return null;

    const medCoding = req?.medicationCodeableConcept?.coding?.[0];
    const catCoding = req?.category?.[0]?.coding?.[0];

    // Primer dosageInstruction (el perfil colombiano solo maneja uno)
    const di = req?.dosageInstruction?.[0];
    const doseAndRate = di?.doseAndRate?.[0];
    const timingCoding = di?.timing?.code?.coding?.[0];
    const repeat = di?.timing?.repeat;

    return {
      id:              req?.id     || '',
      status:          req?.status || '',           // active | completed | cancelled…
      intent:          req?.intent || '',           // order | plan | proposal…
      reportado:       req?.reportedBoolean ?? null, // true = reportado por paciente/cuidador

      // Categoría (ColombianHealthTechnologyCategory)
      categoria: catCoding ? {
        codigo:  catCoding.code    || '',
        display: catCoding.display || ''
      } : null,

      // Medicamento (MipresINN / CUMS / IUM)
      medicamento: {
        codigo:  medCoding?.code    || '',
        display: medCoding?.display || '',
        sistema: medCoding?.system  || ''
      },

      // Referencias
      paciente:  Utils.getText(req?.subject?.reference)   || '',
      encuentro: Utils.getText(req?.encounter?.reference) || '',
      solicitadoPor: Utils.getText(req?.requester?.reference) || '',

      // Fecha de la orden
      fechaOrden: req?.authoredOn || '',

      // Motivo (reasonCode)
      motivos: Utils.safeArray(req?.reasonCode).map(rc => ({
        codigo:  rc?.coding?.[0]?.code    || '',
        display: rc?.coding?.[0]?.display || '',
        text:    rc?.text                 || ''
      })),

      // Instrucción de dosificación
      dosage: di ? {
        // Timing
        timing: {
          duracion: repeat?.duration     ?? null,
          unidadDuracion: repeat?.durationUnit || '',  // d=días, h=horas, wk=semanas…
          display: timingCoding?.display || '',        // ej: "Día"
          codigo:  timingCoding?.code    || ''
        },

        // Vía de administración
        via: di?.route?.coding?.[0] ? {
          codigo:  di.route.coding[0].code    || '',
          display: di.route.coding[0].display || ''
        } : null,

        // Dosis (doseQuantity)
        dosis: doseAndRate?.doseQuantity ? {
          valor:  doseAndRate.doseQuantity.value ?? '',
          unidad: doseAndRate.doseQuantity.unit  || '',
          codigo: doseAndRate.doseQuantity.code  || ''
        } : null,

        // Frecuencia (rateQuantity)
        frecuencia: doseAndRate?.rateQuantity ? {
          valor:  doseAndRate.rateQuantity.value ?? '',
          unidad: doseAndRate.rateQuantity.unit  || ''
        } : null,

        // Texto libre de instrucción (si existe)
        texto: di?.text || ''
      } : null,

      // Notas
      notas: Utils.safeArray(req?.note).map(n => n?.text || '').join(' | ')
    };
  },

  extractLocationData(location) {
    if (!location) return null;
    return {
      id:          location?.id   || '',
      nombre:      location?.name || '',
      codigoReps:  location?.identifier?.[0]?.value  || '',
      sistemaReps: location?.identifier?.[0]?.system || '',
      estado:      location?.status      || '',
      descripcion: location?.description || '',
      organizacion: Utils.getText(location?.managingOrganization?.reference) || '',
      tipo: location?.type?.[0]?.coding?.[0]?.display || '',
      direccion: location?.address ? {
        lineas: Utils.safeArray(location.address.line),
        ciudad: location.address.city    || '',
        estado: location.address.state   || '',
        pais:   location.address.country || ''
      } : null,
      posicion: location?.position ? {
        latitud:  location.position.latitude  ?? null,
        longitud: location.position.longitude ?? null
      } : null
    };
  },

  extractProcedureData(proc) {
    if (!proc) return null;

    const catCoding  = proc?.category?.coding?.[0];
    const codeCoding = proc?.code?.coding?.[0];  // puede ser undefined (OtherTechnology usa code.text)
    const exts       = Utils.safeArray(proc?.extension);

    // Detectar perfil (ProcedureRDA vs OtherTechnologyProcedureRDA)
    const perfil = Utils.safeArray(proc?.meta?.profile)
      .find(p => typeof p === 'string') || '';
    const esOtraTecnologia = perfil.toLowerCase().includes('othertechnology');

    return {
      id:     proc?.id     || '',
      status: proc?.status || '',

      // Perfil usado (determina si tiene codigo CUPS o solo texto)
      esOtraTecnologia,

      categoria: catCoding ? {
        codigo:  catCoding.code    || '',
        display: catCoding.display || ''
      } : null,

      // Para ProcedureRDA: codigo CUPS en coding[0]
      // Para OtherTechnologyRDA: solo code.text, sin coding
      codigo: codeCoding ? {
        codigo:  codeCoding.code    || '',
        display: codeCoding.display || '',
        sistema: codeCoding.system  || ''
      } : null,

      // Descripcion libre (code.text - siempre disponible en ambos perfiles)
      codigoTexto: proc?.code?.text || '',

      paciente:  Utils.getText(proc?.subject?.reference)   || '',
      encuentro: Utils.getText(proc?.encounter?.reference) || '',

      // Fecha de realizacion
      fechaRealizacion: proc?.performedDateTime || proc?.performedPeriod?.start || '',

      // ExtensionRequestDate: fecha en que se solicitó el procedimiento
      fechaSolicitud: exts
        .find(e => Utils.getText(e?.url).includes('ExtensionRequestDate'))
        ?.valueDate || '',

      performers: Utils.safeArray(proc?.performer).map(p => ({
        funcion: p?.function?.coding?.[0]?.display || '',
        actor:   Utils.getText(p?.actor?.reference) || ''
      })),

      motivos: Utils.safeArray(proc?.reasonCode).map(rc => ({
        codigo:  rc?.coding?.[0]?.code    || '',
        display: rc?.coding?.[0]?.display || '',
        text:    rc?.text                 || ''
      })),

      // MainDiagnosis, Comobility-N
      razonesReferencia: Utils.safeArray(proc?.reasonReference).map(rr => ({
        id:         rr?.id        || '',
        referencia: Utils.getText(rr?.reference) || ''
      })),

      // ExtensionSurgicalMethod (si existe)
      metodoQuirurgico: exts
        .find(e => Utils.getText(e?.url).toLowerCase().includes('surgicalmethod'))
        ?.valueCoding?.display || '',

      bodySite: Utils.safeArray(proc?.bodySite).map(bs =>
        bs?.coding?.[0]?.display || bs?.text || ''
      ),

      notas: Utils.safeArray(proc?.note).map(n => n?.text || '').join(' | ')
    };
  },

  extractObservationData(obs) {
    if (!obs) return null;

    const exts   = Utils.safeArray(obs?.extension);
    const comps  = Utils.safeArray(obs?.component);
    const perfil = Utils.safeArray(obs?.meta?.profile).find(p=>typeof p==='string') || '';

    // Detectar tipo de observation por perfil
    const tipoObs = (() => {
      if (perfil.includes('AttendanceAllowanceRDA'))         return 'incapacidad';
      if (perfil.includes('PatientOccupationAtEncounterRDA'))return 'ocupacion';
      if (perfil.includes('ProcedureResultRDA'))             return 'resultado-procedimiento';
      return 'otro';
    })();

    return {
      id:     obs?.id     || '',
      status: obs?.status || '',
      tipoObs,

      // Codigo principal (SNOMED CT / CUPS)
      codigo: obs?.code?.coding?.[0] ? {
        codigo:  obs.code.coding[0].code    || '',
        display: obs.code.coding[0].display || '',
        sistema: obs.code.coding[0].system  || ''
      } : null,

      codigoTexto: obs?.code?.text || '',

      // Referencias
      paciente:  Utils.getText(obs?.subject?.reference)   || '',
      encuentro: Utils.getText(obs?.encounter?.reference) || '',

      // PartOf: procedimiento relacionado (para ProcedureResultRDA)
      parteDe: Utils.safeArray(obs?.partOf).map(p => Utils.getText(p?.reference)).filter(Boolean),

      // Fecha efectiva
      fechaEfectiva: obs?.effectiveDateTime || obs?.effectivePeriod?.start || '',

      // Performer (quien realizó)
      performers: Utils.safeArray(obs?.performer).map(p => Utils.getText(p?.reference)).filter(Boolean),

      // Device (equipo usado - ProcedureResultRDA)
      dispositivo: obs?.device?.identifier?.value || obs?.device?.display || '',

      // Value (para ocupacion)
      valor: obs?.valueCodeableConcept?.coding?.[0] ? {
        codigo:  obs.valueCodeableConcept.coding[0].code    || '',
        display: obs.valueCodeableConcept.coding[0].display || '',
        sistema: obs.valueCodeableConcept.coding[0].system  || ''
      } : (obs?.valueString || obs?.valueQuantity?.value || null),

      // Components (para incapacidad, resultado-procedimiento)
      componentes: comps.map(c => {
        const codComp = c?.code?.coding?.[0];
        return {
          id:      c?.id || '',
          codigo:  codComp?.code    || '',
          display: codComp?.display || '',
          texto:   c?.code?.text    || '',
          // value puede ser CodeableConcept, Quantity, String, etc.
          valor: c?.valueCodeableConcept?.coding?.[0]?.display
                 || c?.valueString
                 || (c?.valueQuantity ? `${c.valueQuantity.value} ${c.valueQuantity.unit}` : '')
                 || ''
        };
      }),

      // Notas
      notas: Utils.safeArray(obs?.note).map(n => n?.text || '').join(' | ')
    };
  },

  extractRiskAssessmentData(risk) {
    if (!risk) return null;

    const codeCoding = risk?.code?.coding?.[0];

    return {
      id:     risk?.id     || '',
      status: risk?.status || '',

      // Código del factor de riesgo (FactorRiesgo)
      codigo: codeCoding ? {
        codigo:  codeCoding.code    || '',
        display: codeCoding.display || '',
        sistema: codeCoding.system  || ''
      } : null,

      // Descripción libre
      codigoTexto: risk?.code?.text || '',

      // Referencias
      paciente:  Utils.getText(risk?.subject?.reference)   || '',
      encuentro: Utils.getText(risk?.encounter?.reference) || '',

      // Fecha de evaluación
      fechaEvaluacion: risk?.occurrenceDateTime || risk?.occurrencePeriod?.start || '',

      // Evaluador/Performer
      evaluador: Utils.getText(risk?.performer?.reference) || '',

      // Método de evaluación
      metodo: risk?.method?.coding?.[0]?.display || risk?.method?.text || '',

      // Basis: razón o fundamento
      basis: Utils.safeArray(risk?.basis).map(b => Utils.getText(b?.reference)).filter(Boolean),

      // Predicción (si existe)
      predicciones: Utils.safeArray(risk?.prediction).map(p => ({
        resultado: p?.outcome?.coding?.[0]?.display || p?.outcome?.text || '',
        probabilidad: p?.probabilityDecimal !== undefined
          ? `${(p.probabilityDecimal * 100).toFixed(1)}%`
          : (p?.probabilityRange
              ? `${p.probabilityRange.low?.value || '?'}-${p.probabilityRange.high?.value || '?'}`
              : ''),
        whenPeriod: p?.whenPeriod
          ? `${p.whenPeriod.start || ''} a ${p.whenPeriod.end || ''}`
          : (p?.whenRange ? `${p.whenRange.low?.value || ''}-${p.whenRange.high?.value || ''}` : ''),
        razon: p?.rationale || ''
      })),

      // Mitigación (recomendaciones)
      mitigacion: risk?.mitigation || '',

      // Notas
      notas: Utils.safeArray(risk?.note).map(n => n?.text || '').join(' | ')
    };
  },

  extractServiceRequestData(svc) {
    if (!svc) return null;

    const catCoding  = svc?.category?.[0]?.coding?.[0];
    const codeCoding = svc?.code?.coding?.[0];

    return {
      id:     svc?.id     || '',
      status: svc?.status || '',
      intent: svc?.intent || '',

      // Categoría (ColombianHealthTechnologyCategory)
      categoria: catCoding ? {
        codigo:  catCoding.code    || '',
        display: catCoding.display || ''
      } : null,

      // Código del servicio (CUPS)
      codigo: codeCoding ? {
        codigo:  codeCoding.code    || '',
        display: codeCoding.display || '',
        sistema: codeCoding.system  || ''
      } : null,

      // Descripción libre
      codigoTexto: svc?.code?.text || '',

      // Referencias
      paciente:  Utils.getText(svc?.subject?.reference)   || '',
      encuentro: Utils.getText(svc?.encounter?.reference) || '',
      solicitante: Utils.getText(svc?.requester?.reference) || '',

      // Fecha de solicitud
      fechaSolicitud: svc?.authoredOn || '',

      // Fecha deseada (occurrence)
      fechaDeseada: svc?.occurrenceDateTime 
                    || svc?.occurrencePeriod?.start 
                    || svc?.occurrenceTiming?.event?.[0]
                    || '',

      // Prioridad
      prioridad: svc?.priority || '',

      // Motivo (reasonCode)
      motivos: Utils.safeArray(svc?.reasonCode).map(rc => ({
        codigo:  rc?.coding?.[0]?.code    || '',
        display: rc?.coding?.[0]?.display || '',
        text:    rc?.text                 || ''
      })),

      // Referencias a razones (conditions, observations)
      razonesReferencia: Utils.safeArray(svc?.reasonReference).map(rr => 
        Utils.getText(rr?.reference)
      ).filter(Boolean),

      // Instrucciones al paciente
      instruccionesPaciente: Utils.safeArray(svc?.patientInstruction).map(pi => pi?.text || '').join(' | '),

      // Especímenes requeridos
      especimenes: Utils.safeArray(svc?.specimen).map(s => Utils.getText(s?.reference)).filter(Boolean),

      // Body site
      bodySite: Utils.safeArray(svc?.bodySite).map(bs =>
        bs?.coding?.[0]?.display || bs?.text || ''
      ),

      // Notas
      notas: Utils.safeArray(svc?.note).map(n => n?.text || '').join(' | ')
    };
  },

  extractDocumentReferenceData(doc) {
    if (!doc) return null;

    const typeCoding = doc?.type?.coding?.[0];
    const catCoding  = doc?.category?.[0]?.coding?.[0];

    return {
      id:     doc?.id     || '',
      status: doc?.status || '',

      // Tipo de documento (LOINC / ColombianDocumentTypes)
      tipo: typeCoding ? {
        codigo:  typeCoding.code    || '',
        display: typeCoding.display || '',
        sistema: typeCoding.system  || ''
      } : null,

      // Tipos adicionales (puede haber múltiples)
      tiposAdicionales: Utils.safeArray(doc?.type?.coding).slice(1).map(c => ({
        codigo:  c?.code    || '',
        display: c?.display || ''
      })),

      // Categoría
      categoria: catCoding ? {
        codigo:  catCoding.code    || '',
        display: catCoding.display || ''
      } : null,

      // Referencias
      paciente:  Utils.getText(doc?.subject?.reference)   || '',
      custodio:  Utils.getText(doc?.custodian?.reference) || '',

      // Fecha del documento
      fecha: doc?.date || '',

      // Autores
      autores: Utils.safeArray(doc?.author).map(a => 
        Utils.getText(a?.reference)
      ).filter(Boolean),

      // Descripción
      descripcion: doc?.description || '',

      // Security Label (confidencialidad)
      confidencialidad: Utils.safeArray(doc?.securityLabel).map(sl => 
        sl?.coding?.[0]?.display || sl?.coding?.[0]?.code || ''
      ).filter(Boolean),

      // Content (adjuntos)
      contenidos: Utils.safeArray(doc?.content).map(c => {
        const att = c?.attachment;
        return {
          contentType: att?.contentType || '',
          formato:     c?.format?.display || c?.format?.code || '',
          url:         att?.url || '',
          titulo:      att?.title || '',
          // Tamaño del adjunto
          tamanio:     att?.size || null,
          // Hash del contenido
          hash:        att?.hash || '',
          // Idioma
          idioma:      att?.language || '',
          // Indica si tiene data base64
          tieneData:   !!att?.data
        };
      }),

      // Context (encuentros relacionados)
      encuentros: Utils.safeArray(doc?.context?.encounter).map(e => 
        Utils.getText(e?.reference)
      ).filter(Boolean),

      // Period del contexto
      periodoContexto: doc?.context?.period ? {
        inicio: doc.context.period.start || '',
        fin:    doc.context.period.end   || ''
      } : null
    };
  }
};

// ============================================================================
// 8. SERVICIOS DE ORGANIZACIÓN Y PROFESIONALES
// ============================================================================

const PractitionerService = {
  extractFromComposition(resultado, composition) {
    const refs = FHIRUtils.ensureRefArrays(resultado?.referencedResources);
    const practSet = new Set();

    const addRefIfPractitioner = (refStr) => {
      const r = Utils.getText(refStr);
      if (r && r.includes('/')) {
        const [type, id] = r.split('/');
        if (type === 'Practitioner' && id) practSet.add(id);
      }
    };

    // 1) Referencias directas en Composition
    Utils.safeArray(composition?.author).forEach(a => addRefIfPractitioner(a?.reference));
    Utils.safeArray(composition?.attester).forEach(a => addRefIfPractitioner(a?.party?.reference));

    // 2) Referencias en sections
    const sectionIds = FHIRUtils.collectSectionReferences(composition);

    // 3) Buscar en recursos relacionados
    const pool = [
      ...refs.encounters,
      ...refs.procedures,
      ...refs.medicationAdministrations,
      ...refs.medicationStatements,
      ...refs.medicationRequests,
      ...refs.allergyIntolerances,
      ...refs.conditions
    ].filter(r => r && sectionIds.has(r.id));

    // 4) Expandir referencias
    pool.forEach(r => {
      // Practitioner directo
      addRefIfPractitioner(r?.recorder?.reference);
      addRefIfPractitioner(r?.asserter?.reference);
      
      // Performers
      Utils.safeArray(r?.performer).forEach(p => {
        addRefIfPractitioner(p?.actor?.reference);
        addRefIfPractitioner(p?.reference);
      });

      // Participants en Encounter
      Utils.safeArray(r?.participant).forEach(p => {
        const refStr = p?.individual?.reference;
        addRefIfPractitioner(refStr);
        
        // Si es PractitionerRole, obtener el practitioner de ahí
        if (refStr && refStr.includes('/')) {
          const [t, id] = refStr.split('/');
          if (t === 'PractitionerRole') {
            const pr = Utils.safeArray(refs.practitionerRoles).find(x => x?.id === id);
            if (pr) addRefIfPractitioner(pr?.practitioner?.reference);
          }
        }
      });

      // Requester
      addRefIfPractitioner(r?.requester?.reference);
    });

    // 5) Mapear IDs a recursos reales
    const practitioners = refs.practitioners.filter(p => p && practSet.has(p.id));

    return practitioners;
  },

  // Buscar practitioner por ID en los recursos referenciados
  findById(resultado, practitionerId) {
    if (!practitionerId) return null;
    const refs = FHIRUtils.ensureRefArrays(resultado?.referencedResources);
    return refs.practitioners.find(p => p?.id === practitionerId) || null;
  },

  // Buscar practitioners relacionados a un encounter
  findByEncounter(resultado, encounter) {
    if (!encounter) return [];
    const practIds = new Set();

    Utils.safeArray(encounter?.participant).forEach(p => {
      const refStr = p?.individual?.reference;
      if (refStr && refStr.includes('/')) {
        const [type, id] = refStr.split('/');
        if (type === 'Practitioner' && id) {
          practIds.add(id);
        } else if (type === 'PractitionerRole' && id) {
          const refs = FHIRUtils.ensureRefArrays(resultado?.referencedResources);
          const pr = refs.practitionerRoles.find(x => x?.id === id);
          if (pr?.practitioner?.reference) {
            const [, practId] = pr.practitioner.reference.split('/');
            if (practId) practIds.add(practId);
          }
        }
      }
    });

    const refs = FHIRUtils.ensureRefArrays(resultado?.referencedResources);
    return refs.practitioners.filter(p => p && practIds.has(p.id));
  }
};

const OrganizationService = {
  isIPS(org) {
    const profiles = Utils.safeArray(org?.meta?.profile).join('|').toLowerCase();
    const hasCareDeliveryProfile = profiles.includes('caredeliveryorganizationrda');

    const hasCodigoPrestador = Utils.safeArray(org?.identifier).some(id =>
      Utils.safeArray(id?.type?.coding).some(c =>
        String(c?.code || '').toUpperCase() === 'CODIGOPRESTADOR' ||
        Utils.toText(c?.display).toLowerCase().includes('habilitación') ||
        Utils.toText(c?.display).toLowerCase().includes('habilitacion')
      ) || String(id?.system || '').toUpperCase().includes('REPS')
    );

    const tipoOrgDisp = Utils.toText(org?.type?.[0]?.coding?.[0]?.display).toLowerCase();
    const tipoSugiereIPS =
      tipoOrgDisp.includes('institución prestadora') ||
      tipoOrgDisp.includes('prestador') ||
      tipoOrgDisp.includes('Organizacion prestadora de salud');

    return hasCareDeliveryProfile || hasCodigoPrestador || tipoSugiereIPS;
  },

  isEPS(org) {
    const profiles = Utils.safeArray(org?.meta?.profile).join('|').toLowerCase();
    const hasHBPAProfile = profiles.includes('healthbenefitplanadminorganizationrda');

    const tipoOrgDisp = Utils.toText(org?.type?.[0]?.coding?.[0]?.display).toLowerCase();
    const tipoSugiereEPS =
      tipoOrgDisp.includes('asegurador') ||
      tipoOrgDisp.includes('entidad administradora') ||
      tipoOrgDisp.includes('eps') ||
      tipoOrgDisp.includes('plan');

    return hasHBPAProfile || tipoSugiereEPS;
  },

  getRol(org) {
    if (this.isIPS(org) && !this.isEPS(org)) return ROLES_ORG.IPS;
    if (this.isEPS(org) && !this.isIPS(org)) return ROLES_ORG.EPS;
    
    const tienePrestador = Utils.safeArray(org?.identifier).some(id =>
      Utils.safeArray(id?.type?.coding).some(c =>
        String(c?.code || '').toUpperCase() === 'CODIGOPRESTADOR'
      )
    );
    
    return tienePrestador ? ROLES_ORG.IPS : ROLES_ORG.GENERIC;
  },

  getNIT(org) {
    const idNit = Utils.safeArray(org?.identifier).find(id =>
      Utils.safeArray(id?.type?.coding).some(c =>
        String(c?.system || '').includes('ColombianOrganizationIdentifiers') &&
        (String(c?.code || '').toUpperCase() === 'NIT' ||
         Utils.toText(c?.display).toUpperCase().includes('NIT'))
      )
    ) || Utils.safeArray(org?.identifier).find(id =>
      Utils.safeArray(id?.type?.coding).some(c => 
        String(c?.code || '').toUpperCase() === 'TAX'
      )
    );
    
    return Utils.toText(idNit?.value);
  },

  getCodigoPrestador(org) {
    const idPrestador = Utils.safeArray(org?.identifier).find(id =>
      Utils.safeArray(id?.type?.coding).some(c =>
        String(c?.system || '').includes('ColombianOrganizationIdentifiers') &&
        (String(c?.code || '').toUpperCase() === 'CODIGOPRESTADOR' ||
         Utils.toText(c?.display).toLowerCase().includes('código de habilitación') ||
         Utils.toText(c?.display).toLowerCase().includes('codigo de habilitacion'))
      )
    ) || Utils.safeArray(org?.identifier).find(id =>
      Utils.safeArray(id?.type?.coding).some(c => 
        String(c?.code || '').toUpperCase() === 'PRN'
      ) &&
      String(id?.system || '').toUpperCase().includes('REPS')
    );
    
    return Utils.toText(idPrestador?.value);
  },

  collectFromComposition(resultado, composition) {
    const refs = FHIRUtils.ensureRefArrays(resultado?.referencedResources);
    const orgSet = new Set();

    const addRefIfOrg = (refStr) => {
      const r = Utils.getText(refStr);
      if (r && r.includes('/')) {
        const [type, id] = r.split('/');
        if (type === 'Organization' && id) orgSet.add(id);
      }
    };

    // Referencias directas en Composition
    addRefIfOrg(composition?.custodian?.reference);
    Utils.safeArray(composition?.attester).forEach(a => addRefIfOrg(a?.party?.reference));
    Utils.safeArray(composition?.author).forEach(a => addRefIfOrg(a?.reference));

    Utils.safeArray(composition?.section).forEach(sec => {
      Utils.safeArray(sec?.entry).forEach(e => addRefIfOrg(e?.reference));
    });

    // IDs referenciados en secciones
    const sectionIds = FHIRUtils.collectSectionReferences(composition);

    // Recursos relacionados
    const pool = [
      ...refs.encounters,
      ...refs.conditions,
      ...refs.procedures,
      ...refs.medicationAdministrations,
      ...refs.medicationStatements,
      ...refs.medicationRequests,
      ...refs.familyMemberHistories,
      ...refs.allergyIntolerances
    ].filter(r => r && sectionIds.has(r.id));

    // Expandir referencias a organizaciones
    pool.forEach(r => {
      addRefIfOrg(r?.serviceProvider?.reference);
      Utils.safeArray(r?.coverage).forEach(cv => addRefIfOrg(cv?.coverage?.reference));
      addRefIfOrg(r?.insurer?.reference);
      addRefIfOrg(r?.owner?.reference);
      
      if (r?.resourceType === 'PractitionerRole') {
        addRefIfOrg(r?.organization?.reference);
      }

      Utils.safeArray(r?.participant).forEach(p => {
        const refStr = p?.individual?.reference;
        if (refStr && refStr.includes('/')) {
          const [t, id] = refStr.split('/');
          if (t === 'PractitionerRole') {
            const pr = Utils.safeArray(refs.practitionerRoles).find(x => x?.id === id);
            if (pr) addRefIfOrg(pr?.organization?.reference);
          }
        }
      });

      addRefIfOrg(r?.provider?.reference);
      addRefIfOrg(r?.requester?.reference);
      addRefIfOrg(r?.performer?.organization?.reference);
      Utils.safeArray(r?.payor).forEach(p => addRefIfOrg(p?.reference));
    });

    return refs.organizations.filter(o => o && orgSet.has(o.id));
  }
};

// ============================================================================
// 9. RENDERIZADORES UI
// ============================================================================

const UIRenderers = {
  renderPatient(infoPatient) {
    const container = DOM.elements.containerPatient;
    if (!container) {
      console.error('No se encontró containerPatient');
      return;
    }

    if (!infoPatient) {
      container.innerHTML = '<p>No se encontró información del paciente.</p>';
      return;
    }

    const nombres = Utils.safeArray(infoPatient.name?.[0]?.given).join(' ');
    const apellidos = Utils.getText(infoPatient.name?.[0]?.family);
    const nombreCompleto = `${nombres} ${apellidos}`.trim();

    const identificador =
      infoPatient.identifier?.find((id) =>
        Utils.safeArray(id.type?.coding).some((c) => 
          c?.code === 'CC' || Utils.getText(c?.display).includes('dula')
        )
      )?.value || infoPatient.identifier?.[0]?.value || '';

    const fechaNacimiento = Utils.getText(infoPatient.birthDate);

    container.innerHTML = `
      <table class="table table-bordered table-striped">
        <thead>
          <tr>
            <th scope="col">Paciente</th>
            <th scope="col">No. de Documento</th>
            <th scope="col">Fecha de Nacimiento</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${nombreCompleto || 'Sin nombre'}</td>
            <td>${identificador || 'Sin documento'}</td>
            <td>${fechaNacimiento || 'Sin fecha'}</td>
          </tr>
        </tbody>
      </table>
    `;
  },

  renderDocumentos(entries) {
    const contenedor = DOM.elements.contenedor;
    if (!contenedor) {
      console.error('❌ No se encontró contenedor');
      return;
    }

    contenedor.innerHTML = '';

    const entriesPaciente = Utils.safeArray(entries).filter((e) => !e?.resource?.encounter);

    console.log(`📊 Mostrando ${entriesPaciente.length} documentos de RDA Paciente`);

    if (entriesPaciente.length > 0) {
      DOM.setBadgeCount('contadorDocumentos', entriesPaciente.length);

      const tabla = document.createElement('table');
      tabla.className = 'table table-bordered table-striped';
      tabla.innerHTML = `
        <thead class="table-dark">
          <tr>
            <th>#</th>
            <th>Formato</th>
            <th>Región</th>
            <th>Autor</th>
            <th>Fecha Bundle</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const cuerpo = tabla.querySelector('tbody');

      entriesPaciente.forEach((entry, index) => {
        const r = entry.resource;
        const org = AppState.datosGlobalesFHIR ? 
          FHIRUtils.obtenerOrganizacionDelRDA(r, AppState.datosGlobalesFHIR) : null;

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
          <td>${index + 1}</td>
          <td>${r?.title || 'RDA'}</td>
          <td>${FHIRUtils.getRegionFromOrg(org)}</td>
          <td>${org?.name || 'N/A'}</td>
          <td>${r?.date || r?.meta?.lastUpdated || 'Sin fecha'}</td>
        `;
        tr.addEventListener('click', () => ModalService.mostrarDetalle(entry));
        cuerpo.appendChild(tr);
      });

      contenedor.appendChild(tabla);
    } else {
      DOM.setBadgeCount('contadorDocumentos', 0);
      const msg = document.createElement('div');
      msg.className = 'alert alert-info';
      msg.innerHTML = '<i class="bx bx-info-circle"></i> No se encontraron documentos de RDA Paciente para este paciente.';
      contenedor.appendChild(msg);
    }
  },

  renderEncuentros(entries) {
    const cont = DOM.elements.contenedorEncuentros;
    const count = DOM.elements.contadorEncuentros;
    
    if (!cont) {
      console.error('❌ No se encontró contenedor de encuentros');
      return;
    }

    cont.innerHTML = '';

    if (!Array.isArray(entries) || entries.length === 0) {
      if (count) {
        count.textContent = '0';
        count.style.display = 'inline-block';
      }
      const msg = document.createElement('div');
      msg.className = 'alert alert-info';
      msg.textContent = 'No se encontraron encuentros clínicos para este paciente.';
      cont.appendChild(msg);
      return;
    }

    if (count) {
      count.textContent = String(entries.length);
      count.style.display = 'inline-block';
    }

    const tabla = document.createElement('table');
    tabla.className = 'table table-bordered table-striped';
    tabla.innerHTML = `
      <thead class="table-dark">
        <tr>
          <th>#</th>
          <th>Formato</th>
          <th>Región</th>
          <th>Autor</th>
          <th>Fecha Bundle</th>
          <th>Origen</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = tabla.querySelector('tbody');

    entries.forEach((entry, index) => {
      const r = entry?.resource;
      if (!r || r.resourceType !== 'Composition') return;

      const origen = entry._source || 'desconocido';
      const origenLabel = entry._sourceLabel || 'No especificado';
      const badgeColor = origen === 'rda-paciente' ? 'bg-primary' : 'bg-success';
      const badgeIcon = origen === 'rda-paciente' ? '👤' : '🏥';
      const badgeText = origen === 'rda-paciente' ? 'Paciente' : 'Encuentros';

      const org = AppState.datosGlobalesFHIR ? 
        FHIRUtils.obtenerOrganizacionDelRDA(r, AppState.datosGlobalesFHIR) : null;

      const tr = document.createElement('tr');
      tr.setAttribute('data-source', origen);
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${r.title || 'RDA'}</td>
        <td>${FHIRUtils.getRegionFromOrg(org)}</td>
        <td>${org?.name || 'N/A'}</td>
        <td>${r.date || r.meta?.lastUpdated || 'Sin fecha'}</td>
        <td><span class="badge ${badgeColor}" title="${origenLabel}">${badgeIcon} ${badgeText}</span></td>
      `;
      tr.addEventListener('click', () => ModalService.mostrarDetalle(entry));
      tbody.appendChild(tr);
    });

    cont.appendChild(tabla);
  },

  renderPaginacion(bundle) {
    const cont = DOM.elements.paginacion;
    if (!cont) {
      console.warn('⚠️ No se encontró contenedor de paginación');
      return;
    }

    cont.innerHTML = '';
    const links = Utils.safeArray(bundle?.link);
    
    if (links.length === 0) {
      console.log('ℹ️ No hay enlaces de paginación disponibles');
      return;
    }


    links.forEach((link) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-outline-primary m-1';
      btn.textContent = ETIQUETAS_PAGINACION[link.relation] || link.relation;

      if (link.relation === 'self') {
        btn.classList.add('active');
        btn.disabled = true;
      }

      btn.addEventListener('click', async () => {
        await PaginationService.cargarPagina(btn, link.url);
      });

      cont.appendChild(btn);
    });
  }
};

// ============================================================================
// 10. SERVICIO DE INMUNIZACIONES
// ============================================================================

const InmunizacionService = {
  getContainer() {
    let cont = DOM.byId('accordion-body-certificado') || DOM.byId('contenedorInmunizaciones');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'accordion-body-certificado';
      document.body.appendChild(cont);
    }
    
    let tabla = DOM.byId('tablaInmunizaciones');
    if (!tabla) {
      tabla = document.createElement('table');
      tabla.id = 'tablaInmunizaciones';
      tabla.className = 'table table-striped table-sm';
      cont.appendChild(tabla);
    }
    
    return { cont, tabla };
  },

  pintarMensaje(htmlMsg, tipo = 'muted') {
    const { tabla } = this.getContainer();
    tabla.innerHTML = `${TABLA_INMUNIZACIONES_HEADER}
      <tbody><tr><td colspan="7" class="text-center text-${tipo}">${htmlMsg}</td></tr></tbody>`;
  },

  renderTabla(items) {
    const { tabla } = this.getContainer();
    
    if (!items || items.length === 0) {
      this.pintarMensaje('<i class="bx bx-info-circle"></i> Sin resultados');
      DOM.setBadgeCount('contadorVacunas', 0, { hideWhenZero: true });
      return;
    }

    const rows = items.map((it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${Utils.escapeHtml(it.vacuna || '')}</td>
        <td>${Utils.escapeHtml(Utils.formatearFecha(it.fecha || ''))}</td>
        <td>${Utils.escapeHtml(it.lote || '')}</td>
        <td>${Utils.escapeHtml(it.prestador || '')}</td>
        <td>${Utils.escapeHtml(it.fabricante || '')}</td>
        <td>${Utils.escapeHtml(it.estado || '')}</td>
      </tr>
    `).join('');

    tabla.innerHTML = `${TABLA_INMUNIZACIONES_HEADER}<tbody>${rows}</tbody>`;
    DOM.setBadgeCount('contadorVacunas', items.length, { hideWhenZero: true });
  },

  limpiar() {
    AppState.ultimoBundleInmunizacion = null;
    this.pintarMensaje('<i class="bx bx-info-circle"></i> Sin datos de inmunización');
    DOM.setBadgeCount('contadorVacunas', 0, { hideWhenZero: true });
  },

  async consultar() {
    const elements = DOM.elements;
    const tipo = Utils.getText(elements.inputTipoDocumento?.value).trim();
    const num = Utils.getText(elements.inputDocumento?.value).trim();

    if (!tipo || !num) return;

    this.pintarMensaje('<i class="bx bx-loader-alt bx-spin"></i> Consultando inmunizaciones…');

    try {
      const bundle = await APIService.consultarInmunizacion(tipo, num);
      AppState.ultimoBundleInmunizacion = bundle;
      
      const inmunizaciones = DataMappers.extractInmunizaciones(bundle);
    
      
      if (!inmunizaciones || inmunizaciones.length === 0) {
        this.pintarMensaje(
          '<i class="bx bx-info-circle"></i> No se encontraron registros de vacunación para este paciente.',
          'info'
        );
        DOM.setBadgeCount('contadorVacunas', 0, { hideWhenZero: true });
        return;
      }
      
      this.renderTabla(inmunizaciones);
      
    } catch (e) {
      console.error('Error en consulta de inmunización:', e);
      this.pintarMensaje(
        `<i class="bx bx-error-circle"></i> ${Utils.escapeHtml(e?.message || 'Error consultando inmunizaciones')}`,
        'danger'
      );
      DOM.setBadgeCount('contadorVacunas', 0, { hideWhenZero: true });
    }
  }
};

// ============================================================================
// 11. SERVICIO DE PAGINACIÓN
// ============================================================================

const PaginationService = {
  async cargarPagina(boton, url) {
    try {
      boton.disabled = true;
      const txt = boton.innerHTML;
      boton.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i>';

      const numeroDocumento = DOM.elements.inputDocumento?.value || 'session';
      const newBundle = await APIService.cargarPagina(url, numeroDocumento);

      // Fusionar recursos referenciados
      if (AppState.datosGlobalesFHIR?.referencedResources && newBundle?.referencedResources) {
        const merged = FHIRUtils.mergeReferencedResources(
          AppState.datosGlobalesFHIR.referencedResources,
          newBundle.referencedResources
        );
        AppState.datosGlobalesFHIR.referencedResources = merged;
      }

      const todos = Utils.safeArray(newBundle?.entry);

      AppState.datosGlobalesFHIR = {
        ...newBundle,
        entry: todos,
        referencedResources: FHIRUtils.ensureRefArrays(
          AppState.datosGlobalesFHIR?.referencedResources
        )
      };

      UIRenderers.renderDocumentos(todos);
      UIRenderers.renderPaginacion(newBundle);

      boton.innerHTML = txt;
      boton.disabled = false;
    } catch (error) {
      console.error('❌ Error cargando página:', error);
      alert('No se pudo cargar la página');
      boton.disabled = false;
    }
  }
};

// ============================================================================
// 12. SERVICIO DE MODAL
// ============================================================================

const ModalService = {
  mostrarDetalle(entry) {
    if (!AppState.datosGlobalesFHIR) {
      console.error('❌ No hay datos globales disponibles');
      return;
    }

    const r = entry.resource;
    const resultado = AppState.datosGlobalesFHIR;

    // Datos principales
    const organizations = OrganizationService.collectFromComposition(resultado, r);
    const orgRDA = FHIRUtils.obtenerOrganizacionDelRDA(r, resultado);
    const organizationsToShow = organizations.length ? organizations : (orgRDA ? [orgRDA] : []);

    // Practitioners
    const practitioners = PractitionerService.extractFromComposition(resultado, r);

    // Encounter
    let encounterData = null;
    const encounterRef = Utils.getText(r?.encounter?.reference);
    if (encounterRef && resultado?.referencedResources?.encounters) {
      const [tipoEnc, idEnc] = encounterRef.split('/');
      encounterData = resultado.referencedResources.encounters.find(
        (e) => e?.resourceType === tipoEnc && e?.id === idEnc
      );
    }
    const enc = encounterData ? DataMappers.mapEncounter(encounterData) : null;

    // Si hay encounter, agregar practitioners de ese encounter
    if (encounterData) {
      const encounterPractitioners = PractitionerService.findByEncounter(resultado, encounterData);
      // Fusionar sin duplicados
      const practIds = new Set(practitioners.map(p => p.id));
      encounterPractitioners.forEach(p => {
        if (!practIds.has(p.id)) {
          practitioners.push(p);
          practIds.add(p.id);
        }
      });
    }

    // Patient
    let patient = null;
    if (Utils.getText(r?.subject?.reference).includes('/')) {
      const [tipoPat, idPat] = r.subject.reference.split('/');
      patient = resultado?.referencedResources?.patients?.find(
        (p) => p?.resourceType === tipoPat && p?.id === idPat
      );
    }
    const patientData = DataMappers.extractPatientData(patient);

    // Recursos relacionados
    const refsIds = FHIRUtils.collectSectionReferences(r);
    const refs = FHIRUtils.ensureRefArrays(resultado?.referencedResources);

    const resources = {
      procedures: refs.procedures.filter((P) => refsIds.has(P.id)),
      medicationAdministrations: refs.medicationAdministrations.filter((M) => refsIds.has(M.id)),
      medicationRequests: refs.medicationRequests.filter((MR) => refsIds.has(MR.id)),
      antecedentes: refs.familyMemberHistories.filter((A) => refsIds.has(A.id)),
      medicationStatements: refs.medicationStatements.filter((MS) => refsIds.has(MS.id)),
      allergyIntolerances: refs.allergyIntolerances.filter((AL) => refsIds.has(AL.id)),
      conditions: refs.conditions.filter((C) => refsIds.has(C.id)),
      locations: refs.locations.filter((L) => refsIds.has(L.id)),
      // Filtrar observations y riskAssessments:
      // 1) Por encounter.reference si existe
      // 2) Si no, por si están en refsIds (sections)
      observations: refs.observations.filter(o => {
        // Si tiene encounter.reference, verificar que coincida
        const oEncRef = Utils.getText(o?.encounter?.reference);
        if (oEncRef) {
          // Normalizar referencias: eliminar # y /
          const normalizedOEnc = oEncRef.replace(/^#/, '').replace(/^.*\//, '');
          const normalizedCurrentEnc = encounterRef.replace(/^#/, '').replace(/^.*\//, '');
          return normalizedOEnc === normalizedCurrentEnc;
        }
        // Si no tiene encounter, verificar si está en sections
        return refsIds.has(o.id);
      }),
      riskAssessments: refs.riskAssessments.filter(r => {
        // Si tiene encounter.reference, verificar que coincida
        const rEncRef = Utils.getText(r?.encounter?.reference);
        if (rEncRef) {
          // Normalizar referencias: eliminar # y /
          const normalizedREnc = rEncRef.replace(/^#/, '').replace(/^.*\//, '');
          const normalizedCurrentEnc = encounterRef.replace(/^#/, '').replace(/^.*\//, '');
          return normalizedREnc === normalizedCurrentEnc;
        }
        // Si no tiene encounter, verificar si está en sections
        return refsIds.has(r.id);
      }),
      serviceRequests: refs.serviceRequests.filter(s => {
        // Filtrar por encounter igual que observations y riskAssessments
        const sEncRef = Utils.getText(s?.encounter?.reference);
        if (sEncRef) {
          const normalizedSEnc = sEncRef.replace(/^#/, '').replace(/^.*\//, '');
          const normalizedCurrentEnc = encounterRef.replace(/^#/, '').replace(/^.*\//, '');
          return normalizedSEnc === normalizedCurrentEnc;
        }
        return refsIds.has(s.id);
      }),
      documentReferences: refs.documentReferences.filter(d => {
        // Filtrar por encuentros en context.encounter[]
        const encounters = Utils.safeArray(d?.context?.encounter);
        if (encounters.length > 0) {
          return encounters.some(e => {
            const dEncRef = Utils.getText(e?.reference);
            if (dEncRef) {
              const normalizedDEnc = dEncRef.replace(/^#/, '').replace(/^.*\//, '');
              const normalizedCurrentEnc = encounterRef.replace(/^#/, '').replace(/^.*\//, '');
              return normalizedDEnc === normalizedCurrentEnc;
            }
            return false;
          });
        }
        return refsIds.has(d.id);
      }),
      practitioners: practitioners
    };

    // Construir HTML
    const html = this.construirHTML(entry, enc, patientData, organizationsToShow, resources);

    // Mostrar modal
    const contModal = DOM.elements.modalContent;
    if (!contModal) {
      console.error('❌ No existe el contenedor del modal');
      return;
    }
    contModal.innerHTML = html;

    const modalEl = DOM.byId('exampleModal');
    if (!modalEl || !window.bootstrap?.Modal) {
      console.warn('⚠️ Bootstrap Modal no disponible');
      return;
    }
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  },

  construirHTML(entry, enc, patientData, organizations, resources) {
    let html = `
      <div class="alert alert-info d-flex align-items-center" role="alert">
        <i class="bx bx-info-circle me-2"></i>
        <div>
          <strong>Origen del documento:</strong>
          <span class="badge ${entry._source === 'rda-paciente' ? 'bg-primary' : 'bg-success'} ms-2">
            ${entry._source === 'rda-paciente' ? '👤' : '🏥'} ${entry._sourceLabel || 'No especificado'}
          </span>
        </div>
      </div>
    `;

    // Encounter
    if (enc) {
      html += this.renderEncounter(enc, organizations[0]);
    }

    // Patient
    if (patientData) {
      html += this.renderPatient(patientData);
    }

    // Organizations
    html += this.renderOrganizations(organizations);

    // Practitioners (nuevo)
    if (resources.practitioners && resources.practitioners.length > 0) {
      html += this.renderPractitioners(resources.practitioners);
    }

    // Recursos relacionados
    html += this.renderRelatedResources(resources);

    return html;
  },

  renderEncounter(enc, orgRDA) {
    if (!enc) return '';

    const statusBadge = (() => {
      const s = (enc.status || '').toLowerCase();
      if (s === 'finished')    return ['bg-success',           'Finalizado'];
      if (s === 'in-progress') return ['bg-primary',           'En progreso'];
      if (s === 'planned')     return ['bg-warning text-dark', 'Planificado'];
      if (s === 'cancelled')   return ['bg-danger',            'Cancelado'];
      if (s === 'arrived')     return ['bg-info',              'Llegada'];
      return enc.status ? ['bg-secondary', enc.status] : null;
    })();

    const claseBadge = (() => {
      const c = (enc.clase?.codigo || '').toUpperCase();
      if (c === 'IMP')  return ['bg-danger',           'Hospitalización'];
      if (c === 'AMB')  return ['bg-success',           'Ambulatorio'];
      if (c === 'EMER') return ['bg-warning text-dark', 'Urgencias'];
      if (c === 'VR')   return ['bg-info',              'Virtual'];
      if (c === 'SS')   return ['bg-secondary',         'Especialidad'];
      return enc.clase?.display ? ['bg-secondary', enc.clase.display] : null;
    })();

    const SISTEMA_LABELS = {
      'ColombianTechModality': 'Modalidad',
      'GrupoServicios':        'Grupo de Servicio',
      'EntornoAtencion':       'Entorno de Atención'
    };
    const tipoLabel = (s) => {
      for (const [k, v] of Object.entries(SISTEMA_LABELS)) {
        if ((s || '').includes(k)) return v;
      }
      return 'Tipo';
    };

    const ROL_LABELS = {
      'DIS':  '🩺 Médico egresador',
      'ATND': '🩺 Médico tratante',
      'PART': '👤 Participante',
      'ADM':  '🏥 Médico admisión',
      'CON':  '🔬 Consultor',
      'REF':  '📋 Médico remitente'
    };

    const TIPO_DX_BADGE = (codigo) => {
      if (codigo === '01') return 'bg-warning text-dark';
      if (codigo === '02') return 'bg-success';
      if (codigo === '03') return 'bg-info';
      return 'bg-secondary';
    };

    return `
      <div class="card mb-3 shadow-sm">
        <div class="card-header bg-primary text-white">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
            <h4 class="mb-0"><i class="bx bx-clinic"></i> Encuentro Clínico</h4>
            <div class="d-flex gap-1 flex-wrap">
              ${claseBadge  ? `<span class="badge ${claseBadge[0]}">${claseBadge[1]}</span>` : ''}
              ${statusBadge ? `<span class="badge ${statusBadge[0]}">${statusBadge[1]}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="card-body">

          <div class="row g-3">
            <!-- Columna izquierda: identificacion y fechas -->
            <div class="col-12 col-md-6">

              ${enc.identificador ? `
                <p class="mb-2"><strong>N° Encuentro:</strong>
                  <code>${Utils.escapeHtml(enc.identificador)}</code>
                </p>` : ''}

              ${enc.periodo.inicio ? `
                <p class="mb-2"><strong>Fecha de Ingreso:</strong>
                  ${Utils.escapeHtml(Utils.formatearFecha(enc.periodo.inicio))}
                </p>` : ''}

              ${enc.periodo.fin ? `
                <p class="mb-2"><strong>Fecha de Egreso:</strong>
                  ${Utils.escapeHtml(Utils.formatearFecha(enc.periodo.fin))}
                </p>` : ''}

              ${enc.motivos.length > 0 ? `
                <p class="mb-2"><strong>Causa Externa / Motivo:</strong><br>
                  ${enc.motivos.map(m =>
                    `<span class="badge bg-secondary me-1">
                      ${Utils.escapeHtml(m.display || m.text || m.codigo)}
                      ${m.codigo ? `[${Utils.escapeHtml(m.codigo)}]` : ''}
                    </span>`
                  ).join('')}
                </p>` : ''}

              ${orgRDA?.name ? `
                <p class="mb-2"><strong>Prestador:</strong>
                  ${Utils.escapeHtml(orgRDA.name)}
                </p>` : ''}

            </div>

            <!-- Columna derecha: tipos y participantes -->
            <div class="col-12 col-md-6">

              ${enc.tipos.length > 0 ? enc.tipos.map(t => `
                <p class="mb-2"><strong>${tipoLabel(t.sistema)}:</strong>
                  ${Utils.escapeHtml(t.display)}
                
                </p>`).join('') : ''}

            </div>
          </div>

         
          <!-- Diagnosticos del encuentro -->
          ${enc.diagnosticos.length > 0 ? `
            <hr>
            <p class="mb-2 fw-bold">Diagnósticos del Encuentro:</p>
            <div class="table-responsive">
              <table class="table table-sm table-bordered align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>#</th>
                    <th>Rol diagnóstico</th>
                    <th>Tipo</th>
                   
                  </tr>
                </thead>
                <tbody>
                  ${enc.diagnosticos.map(d => `
                    <tr>
                      <td>${d.rank ?? '—'}</td>
                      <td>${Utils.escapeHtml(d.rol)}</td>
                      <td>
                        ${d.tipoDx
                          ? `<span class="badge ${TIPO_DX_BADGE(d.tipoDxCodigo)}">
                              ${Utils.escapeHtml(d.tipoDx)}
                            </span>`
                          : '—'}
                      </td>
                     
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>` : ''}

          <!-- Hospitalizacion -->
          ${enc.hospitalizacion ? `
            <hr>
            <p class="mb-2 fw-bold">Hospitalización:</p>
            <div class="row g-2">
              ${enc.hospitalizacion.viaIngreso ? `
                <div class="col-12 col-sm-6 col-md-4">
                  <div class="border rounded p-2 h-100">
                    <p class="text-muted small mb-1">Vía de Ingreso</p>
                    <p class="mb-0 fw-bold small">
                      ${Utils.escapeHtml(enc.hospitalizacion.viaIngreso)}
                     
                    </p>
                  </div>
                </div>` : ''}

              ${enc.hospitalizacion.condicionEgreso ? `
                <div class="col-12 col-sm-6 col-md-4">
                  <div class="border rounded p-2 h-100">
                    <p class="text-muted small mb-1">Condición y Destino de Egreso</p>
                    <p class="mb-0 fw-bold small">
                      ${Utils.escapeHtml(enc.hospitalizacion.condicionEgreso)}
                    
                    </p>
                  </div>
                </div>` : ''}

              ${enc.hospitalizacion.estadoFallecimiento ? `
                <div class="col-12 col-sm-6 col-md-4">
                  <div class="border rounded p-2 h-100">
                    <p class="text-muted small mb-1">Estado al Egreso</p>
                    <p class="mb-0 fw-bold small">
                      ${Utils.escapeHtml(enc.hospitalizacion.estadoFallecimiento)}
                    </p>
                  </div>
                </div>` : ''}

              ${enc.hospitalizacion.destino ? `
                <div class="col-12 col-sm-6 col-md-4">
                  <div class="border rounded p-2 h-100">
                    <p class="text-muted small mb-1">Institución de Destino</p>
                    <p class="mb-0 fw-bold small">
                      <code>${Utils.escapeHtml(enc.hospitalizacion.destino)}</code>
                    </p>
                  </div>
                </div>` : ''}
            </div>` : ''}

        </div>
      </div>
    `;
  },

  renderPatient(data) {
    return `
      <div class="card mb-3 shadow-sm">
        <div class="card-header bg-success text-white">
          <h4 class="mb-0">Datos del Paciente</h4>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-12 col-md-6">
              <p><strong>Activo:</strong> ${data.activo ? 'Sí' : 'No'}</p>
              <p><strong>Fallecido:</strong> ${data.fallecido ? 'Sí' : 'No'}</p>
              <p><strong>Nombre:</strong> ${data.nombres || 'N/A'}</p>
              <p><strong>Documento:</strong> ${data.documento || 'N/A'}</p>
              <p><strong>Tipo de documento:</strong> ${
                data.tipoDocumento
                  ? `${data.tipoDocumento.code}${data.tipoDocumento.display ? ' – ' + data.tipoDocumento.display : ''}`
                  : 'N/A'
              }</p>
              <p><strong>Fecha de Nacimiento:</strong> ${data.fechaNacimiento || 'N/A'}</p>
              <p><strong>Hora de Nacimiento:</strong> ${data.horaNacimiento || 'N/A'}</p>
              <p><strong>Edad:</strong> ${data.edad !== '' ? data.edad + ' años' : 'N/A'}</p>
             
            </div>
            <div class="col-12 col-md-6">
              <p><strong>País de Residencia:</strong> ${data.paisResidencia || 'N/A'}</p>
              <p><strong>Municipio de Residencia:</strong> ${data.municipioResidencia || 'N/A'}</p>
              <p><strong>Sexo Biológico (extensión):</strong> ${data.sexoBiologicoExt || 'N/A'}</p>
              <p><strong>Identidad de Género:</strong> ${data.identidadGenero || 'N/A'}</p>
              <p><strong>Nacionalidad:</strong> ${data.nacionalidad || 'N/A'}</p>
              <p><strong>Zona de Residencia:</strong> ${data.zonaResidencia || 'N/A'}</p>
              <p><strong>DIVIPOLA Municipio:</strong> ${data.divipolaMunicipio || 'N/A'}</p>
              <p><strong>Código país:</strong> ${data.codigoPais || 'N/A'}</p>
              <p><strong>Etnia:</strong> ${data.etnia || 'N/A'}</p>
              <p><strong>Tipo Discapacidad:</strong> ${data.discapacidad || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderOrganizations(organizations) {
    const totalOrgs = organizations.length;
    let html = '';

    organizations.forEach((org, idx) => {
      const rol = totalOrgs <= 1 ? 'Organizacion prestadora de salud' : OrganizationService.getRol(org);
      const headerClass = rol === 'EPS' ? 'bg-info' : 'bg-secondary';

      const nombreOrg = Utils.toText(org?.name);
      const nit = OrganizationService.getNIT(org);
      const codigoPrestador = OrganizationService.getCodigoPrestador(org);
      const tipoOrg = Utils.toText(org?.type?.[0]?.coding?.[0]?.display);

      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header ${headerClass} text-white d-flex justify-content-between align-items-center">
            <h4 class="mb-0">${rol}${totalOrgs > 1 ? ` #${idx + 1}` : ''}</h4>
          </div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-12 col-md-6">
                ${Utils.field('Nombre', nombreOrg)}
                ${Utils.field('NIT', nit)}
                ${Utils.field('Código de habilitación (REPS)', codigoPrestador)}
                ${Utils.field('Tipo de organización', tipoOrg)}
              </div>
            </div>
          </div>
        </div>
      `;
    });

    return html;
  },

  renderPractitioners(practitioners) {
    if (!practitioners || practitioners.length === 0) return '';

    let html = '';

    practitioners.forEach((pract, idx) => {
      const data = DataMappers.extractPractitionerData(pract);
      if (!data) return;

      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header bg-primary text-white">
            <h4 class="mb-0">
              <i class="bx bx-user-circle"></i> Profesional de la Salud${practitioners.length > 1 ? ` #${idx + 1}` : ''}
            </h4>
          </div>
          <div class="card-body">
            <div class="row g-3">
              <!-- Columna izquierda -->
              <div class="col-12 col-md-6">
                ${Utils.field('Nombre completo', data.nombreCompleto)}  
                ${Utils.field('Documento', data.documento)}
                ${data.tipoDocumento ? Utils.field('Tipo de documento', 
                  `${data.tipoDocumento.code}${data.tipoDocumento.display ? ' – ' + data.tipoDocumento.display : ''}`
                ) : ''}
                ${Utils.field('Estado', data.activo ? 'Activo' : 'Inactivo')}
              </div>
            </div>

            <!-- Cualificaciones profesionales -->
            ${data.qualification.length > 0 ? `
              <hr>
              <h5><i class="bx bx-medal"></i> Cualificaciones Profesionales</h5>
              <div class="table-responsive">
                <table class="table table-sm table-bordered">
                  <thead class="table-light">
                    <tr>
                      <th>#</th>
                      <th>Cualificación</th>
                      <th>Periodo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.qualification.map((q, i) => `
                      <tr>
                        <td>${i + 1}</td>
                        <td>${Utils.escapeHtml(q.display || 'N/A')}</td>
                        <td>
                          ${q.periodo.inicio || 'N/A'}
                          ${q.periodo.fin ? ' - ' + q.periodo.fin : ' - Actual'}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });

    return html;
  },

  renderRelatedResources(resources) {
    let html = '';

    // Conditions (Diagnósticos) - NUEVA SECCIÓN MEJORADA
    if (resources.conditions && resources.conditions.length > 0) {
      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header bg-warning text-dark">
            <h4 class="mb-0">
              <i class="bx bx-health"></i> Diagnósticos / Condiciones (${resources.conditions.length})
            </h4>
          </div>
          <div class="card-body">
      `;

      resources.conditions.forEach((condition, idx) => {
        const data = DataMappers.extractConditionData(condition);
        if (!data) return;

        // Determinar color del badge según estado clínico
        const getBadgeClass = (estado) => {
          const estadoLower = (estado || '').toLowerCase();
          if (estadoLower.includes('active') || estadoLower.includes('activo')) return 'bg-danger';
          if (estadoLower.includes('resolved') || estadoLower.includes('resuelto')) return 'bg-success';
          if (estadoLower.includes('inactive') || estadoLower.includes('inactivo')) return 'bg-secondary';
          return 'bg-info';
        };

        const badgeClass = getBadgeClass(data.estadoClinico.display);

        html += `
          ${idx > 0 ? '<hr>' : ''}
          <div class="condition-item ${idx > 0 ? 'mt-3' : ''}">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <h5 class="mb-0">
                <span class="badge bg-secondary me-2">#${idx + 1}</span>
                ${Utils.escapeHtml(data.codigo.display || data.codigo.text || 'Sin descripción')}
              </h5>
              <span class="badge ${badgeClass}">${Utils.escapeHtml(data.estadoClinico.display || 'Sin estado')}</span>
            </div>

            <div class="row g-3">
              <!-- Columna izquierda -->
              <div class="col-12 col-md-6">
                <p class="mb-2"><strong>Código ICD-10:</strong> 
                <span style="color: black;">${(data.codigo.codigo || 'N/A')}</span>
                </p>
                
                ${data.categoria.display ? `
                  <p class="mb-2"><strong>Categoría:</strong> 
                    ${Utils.escapeHtml(data.categoria.display)}
                   </p>
                ` : ''}

                ${data.estadoVerificacion.display ? `
                <p class="mb-2">
                  <strong>Estado de Verificación:</strong>
                  ${Utils.escapeHtml(data.estadoVerificacion.display)}
                </p>
              ` : ''}
            </div>
            ${data.notas ? `
              <div class="mt-2 p-2 bg-light rounded">
                <p class="mb-0"><strong>Notas:</strong></p>
                <p class="mb-0 text-muted small">${Utils.escapeHtml(data.notas)}</p>
              </div>
            ` : ''}
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    // Alergias e Intolerancias
    if (resources.allergyIntolerances?.length > 0) {
      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header bg-danger text-white">
            <h4 class="mb-0">
              <i class="bx bx-error-alt"></i>
              Alergias e Intolerancias (${resources.allergyIntolerances.length})
            </h4>
          </div>
          <div class="card-body">
      `;

      resources.allergyIntolerances.forEach((allergy, idx) => {
        const a = DataMappers.extractAllergyData(allergy);
        if (!a) return;

        // ── Badges dinámicos ──────────────────────────────────────────────────

        // Estado clínico
        const estadoBadge = (() => {
          const c = (a.estadoClinico.display || '').toLowerCase();
          if (c.includes('active')   || c.includes('activ'))  return ['bg-danger',    a.estadoClinico.display];
          if (c.includes('resolved') || c.includes('resuel')) return ['bg-success',   a.estadoClinico.display];
          if (c.includes('inactive') || c.includes('inactiv'))return ['bg-secondary', a.estadoClinico.display];
          return a.estadoClinico.display ? ['bg-info', a.estadoClinico.display] : null;
        })();

        // Tipo FHIR (allergy | intolerance) — puede estar ausente
        const tipoBadge = (() => {
          const t = (a.tipo || '').toLowerCase();
          if (t === 'allergy')     return ['bg-danger',          '🚨 Alergia'];
          if (t === 'intolerance') return ['bg-warning text-dark','⚠️ Intolerancia'];
          return null;
        })();

        // Criticidad — puede estar ausente
        const criticidadBadge = (() => {
          const c = (a.criticidad || '').toLowerCase();
          if (c === 'high')            return ['bg-danger',    '⚠️ Criticidad alta'];
          if (c === 'low')             return ['bg-success',   '🟢 Criticidad baja'];
          if (c.includes('unable'))    return ['bg-secondary', '❓ Sin evaluar'];
          return a.criticidad ? ['bg-warning text-dark', a.criticidad] : null;
        })();

        // Verificación — puede ser null
        const verificacionBadge = a.estadoVerificacion ? (() => {
          const v = (a.estadoVerificacion.display || '').toLowerCase();
          const cls = v.includes('confirm') ? 'bg-success' : 'bg-warning text-dark';
          return [cls, a.estadoVerificacion.display];
        })() : null;

        // Color de severidad de reacciones
        const severidadColor = (s) => {
          const sl = (s || '').toLowerCase();
          if (sl === 'severe')   return 'text-danger fw-bold';
          if (sl === 'moderate') return 'text-warning fw-bold';
          if (sl === 'mild')     return 'text-success';
          return 'text-muted';
        };

        // Etiquetas de categoría FHIR
        const LABELS_CATEGORIA = {
          food:        '🍽️ Alimento',
          medication:  '💊 Medicamento',
          environment: '🌿 Ambiental',
          biologic:    '🧬 Biológico'
        };

        // ── HTML del ítem ─────────────────────────────────────────────────────
        html += `
          ${idx > 0 ? '<hr class="my-3">' : ''}
          <div class="allergy-item ${idx > 0 ? 'mt-3' : ''}">

            <!-- Encabezado: nombre + badges de estado -->
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-1 mb-3">
              <h5 class="mb-0">
                <span class="badge bg-secondary me-1">#${idx + 1}</span>
                ${Utils.escapeHtml(a.descripcion || a.tipoAlergia.display || 'Sin descripción')}
              </h5>
              <div class="d-flex flex-wrap gap-1">
                ${tipoBadge       ? `<span class="badge ${tipoBadge[0]}">${tipoBadge[1]}</span>`                               : ''}
                ${estadoBadge     ? `<span class="badge ${estadoBadge[0]}">${Utils.escapeHtml(estadoBadge[1])}</span>`         : ''}
                ${criticidadBadge ? `<span class="badge ${criticidadBadge[0]}">${criticidadBadge[1]}</span>`                   : ''}
              </div>
            </div>

            <!-- Datos principales en dos columnas -->
            <div class="row g-3">

              <!-- Columna izquierda -->
              <div class="col-12 col-md-6">

                <!-- Tipo de alergia (campo code de MinSalud) -->
                ${a.tipoAlergia.display ? `
                  <p class="mb-2">
                    <strong>Tipo de Alergia:</strong>
                    ${Utils.escapeHtml(a.tipoAlergia.display)}
                   
                  </p>` : ''}

                <!-- Descripción libre (code.text) -->
                ${a.descripcion ? `
                  <p class="mb-2">
                    <strong>Descripción:</strong>
                    ${Utils.escapeHtml(a.descripcion)}
                  </p>` : ''}

                <!-- Estado de verificación -->
                ${verificacionBadge ? `
                  <p class="mb-2">
                    <strong>Verificación:</strong>
                    <span class="badge ${verificacionBadge[0]} ms-1">
                      ${Utils.escapeHtml(verificacionBadge[1])}
                    </span>
                  </p>` : ''}

                <!-- Categorías FHIR (food/medication/…) si vienen -->
                ${a.categorias.length > 0 ? `
                  <p class="mb-2">
                    <strong>Categoría:</strong>
                    ${a.categorias.map(c =>
                      `<span class="badge bg-secondary ms-1">
                        ${LABELS_CATEGORIA[c] || Utils.escapeHtml(c)}
                      </span>`
                    ).join('')}
                  </p>` : ''}

              </div>

              <!-- Columna derecha -->
              <div class="col-12 col-md-6">

              

                ${a.fechaRegistro ? `
                  <p class="mb-2">
                    <strong>Fecha de Registro:</strong>
                    ${Utils.escapeHtml(Utils.formatearFecha(a.fechaRegistro))}
                  </p>` : ''}


              </div>
            </div>

          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    // Administración de Medicamentos
    if (resources.medicationAdministrations?.length > 0) {
      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header bg-info text-white">
            <h4 class="mb-0">
              <i class="bx bx-capsule"></i>
              Administración de Medicamentos (${resources.medicationAdministrations.length})
            </h4>
          </div>
          <div class="card-body">
      `;

      resources.medicationAdministrations.forEach((med, idx) => {
        const m = DataMappers.extractMedicationAdministrationData(med);
        if (!m) return;

        const statusBadge = (() => {
          const s = (m.status || '').toLowerCase();
          if (s === 'completed')  return ['bg-success',   '✅ Completado'];
          if (s === 'in-progress')return ['bg-primary',   '🔄 En progreso'];
          if (s === 'stopped')    return ['bg-danger',    '🛑 Detenido'];
          if (s === 'on-hold')    return ['bg-warning text-dark', '⏸️ En espera'];
          if (s === 'not-done')   return ['bg-secondary', '❌ No realizado'];
          return m.status ? ['bg-secondary', m.status] : null;
        })();

        html += `
          ${idx > 0 ? '<hr class="my-3">' : ''}
          <div class="medadmin-item ${idx > 0 ? 'mt-3' : ''}">

            <!-- Encabezado: nombre del medicamento + estado -->
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-1 mb-3">
              <h5 class="mb-0">
                <span class="badge bg-secondary me-1">#${idx + 1}</span>
                ${Utils.escapeHtml(m.medicamento.display || 'Sin nombre')}
              </h5>
              ${statusBadge
                ? `<span class="badge ${statusBadge[0]}">${statusBadge[1]}</span>`
                : ''}
            </div>

            <div class="row g-3">

              <!-- Columna izquierda: identificación del medicamento -->
              <div class="col-12 col-md-6">

                ${m.medicamento.codigo ? `
                  <p class="mb-2">
                    <strong>Código IUM:</strong>
                    <code>${Utils.escapeHtml(m.medicamento.codigo)}</code>
                  </p>` : ''}

                ${m.categoria.display ? `
                  <p class="mb-2">
                    <strong>Categoría:</strong>
                    ${Utils.escapeHtml(m.categoria.display)}
                    ${m.categoria.codigo
                      ? `<code class="ms-1">${Utils.escapeHtml(m.categoria.codigo)}</code>`
                      : ''}
                  </p>` : ''}

                ${m.fechaAdministracion ? `
                  <p class="mb-2">
                    <strong>Fecha de Administración:</strong>
                    ${Utils.escapeHtml(Utils.formatearFecha(m.fechaAdministracion))}
                  </p>` : ''}

             
              </div>

              <!-- Columna derecha: dosificación y cantidades -->
              <div class="col-12 col-md-6">

                ${m.dosage.dosis ? `
                  <p class="mb-2">
                    <strong>Dosis:</strong>
                    ${Utils.escapeHtml(String(m.dosage.dosis.valor))}
                    ${Utils.escapeHtml(m.dosage.dosis.unidad)}
                    
                  </p>` : ''}

                ${m.dosage.via ? `
                  <p class="mb-2">
                    <strong>Vía de Administración:</strong>
                    ${Utils.escapeHtml(m.dosage.via.display || m.dosage.via.codigo)}
                    ${m.dosage.via.codigo
                      ? `<code class="ms-1">${Utils.escapeHtml(m.dosage.via.codigo)}</code>`
                      : ''}
                  </p>` : ''}

                ${m.dosage.frecuencia ? `
                  <p class="mb-2">
                    <strong>Frecuencia:</strong>
                    Cada ${Utils.escapeHtml(String(m.dosage.frecuencia.valor))}
                    ${Utils.escapeHtml(m.dosage.frecuencia.unidad)}
                  </p>` : ''}

             


              </div>
            </div>

         

          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    // MedicationStatements (medicamentos referidos / crónicos)
    if (resources.medicationStatements?.length > 0) {
      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header bg-info text-white">
            <h4 class="mb-0">
              <i class="bx bx-list-ul"></i>
              Medicamentos Referidos (${resources.medicationStatements.length})
            </h4>
          </div>
          <div class="card-body">
      `;

      resources.medicationStatements.forEach((med, idx) => {
        const medCoding = med?.medicationCodeableConcept?.coding?.[0];
        html += `
          ${idx > 0 ? '<hr class="my-2">' : ''}
          <div class="${idx > 0 ? 'mt-2' : ''}">
            <span class="badge bg-secondary me-1">#${idx + 1}</span>
            <strong>${Utils.escapeHtml(medCoding?.display || 'Sin nombre')}</strong>
            ${medCoding?.code ? `<code class="ms-1">${Utils.escapeHtml(medCoding.code)}</code>` : ''}
            ${med?.status ? `<span class="badge bg-secondary ms-2">${Utils.escapeHtml(med.status)}</span>` : ''}
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    // Órdenes de Medicamento (MedicationRequest)
    if (resources.medicationRequests?.length > 0) {
      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header bg-primary text-white">
            <h4 class="mb-0">
              <i class="bx bx-notepad"></i>
              Órdenes de Medicamento (${resources.medicationRequests.length})
            </h4>
          </div>
          <div class="card-body">
      `;

      resources.medicationRequests.forEach((req, idx) => {
        const r = DataMappers.extractMedicationRequestData(req);
        if (!r) return;

        // ── Badges ────────────────────────────────────────────────────────────
        const statusBadge = (() => {
          const s = (r.status || '').toLowerCase();
          if (s === 'active')     return ['bg-success',          '✅ Activa'];
          if (s === 'completed')  return ['bg-secondary',        '☑️ Completada'];
          if (s === 'cancelled')  return ['bg-danger',           '❌ Cancelada'];
          if (s === 'on-hold')    return ['bg-warning text-dark','⏸️ En espera'];
          if (s === 'stopped')    return ['bg-danger',           '🛑 Detenida'];
          if (s === 'draft')      return ['bg-secondary',        '📝 Borrador'];
          return r.status ? ['bg-secondary', r.status] : null;
        })();

        const intentBadge = (() => {
          const i = (r.intent || '').toLowerCase();
          if (i === 'order')     return ['bg-primary',           '📋 Orden'];
          if (i === 'plan')      return ['bg-info',              '🗓️ Plan'];
          if (i === 'proposal')  return ['bg-secondary',        '💡 Propuesta'];
          if (i === 'instance-order') return ['bg-primary',     '📋 Orden instancia'];
          return r.intent ? ['bg-secondary', r.intent] : null;
        })();

        // Etiqueta de duración legible
        const UNIDADES_DURACION = { d: 'días', h: 'horas', wk: 'semanas', mo: 'meses', a: 'años', min: 'minutos' };
        const duracionLabel = r.dosage?.timing?.duracion != null
          ? `${r.dosage.timing.duracion} ${UNIDADES_DURACION[r.dosage.timing.unidadDuracion] || r.dosage.timing.unidadDuracion}`
          : '';

        html += `
          ${idx > 0 ? '<hr class="my-3">' : ''}
          <div class="medreq-item ${idx > 0 ? 'mt-3' : ''}">

            <!-- Encabezado: nombre medicamento + badges -->
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-1 mb-3">
              <h5 class="mb-0">
                <span class="badge bg-secondary me-1">#${idx + 1}</span>
                ${Utils.escapeHtml(r.medicamento.display || 'Sin nombre')}
              </h5>
              <div class="d-flex flex-wrap gap-1">
                ${intentBadge  ? `<span class="badge ${intentBadge[0]}">${intentBadge[1]}</span>`   : ''}
                ${statusBadge  ? `<span class="badge ${statusBadge[0]}">${statusBadge[1]}</span>`   : ''}
                ${r.reportado  ? `<span class="badge bg-warning text-dark">📣 Reportado</span>`     : ''}
              </div>
            </div>

            <div class="row g-3">

              <!-- Columna izquierda: identificación -->
              <div class="col-12 col-md-6">

                ${r.medicamento.codigo ? `
                  <p class="mb-2">
                    <strong>Código (INN/IUM):</strong>
                    <code>${Utils.escapeHtml(r.medicamento.codigo)}</code>
                  </p>` : ''}

                ${r.categoria ? `
                  <p class="mb-2">
                    <strong>Categoría:</strong>
                    ${Utils.escapeHtml(r.categoria.display)}
                    ${r.categoria.codigo
                      ? `<code class="ms-1">${Utils.escapeHtml(r.categoria.codigo)}</code>`
                      : ''}
                  </p>` : ''}

                ${r.fechaOrden ? `
                  <p class="mb-2">
                    <strong>Fecha de Orden:</strong>
                    ${Utils.escapeHtml(Utils.formatearFecha(r.fechaOrden))}
                  </p>` : ''}

               

                ${r.motivos.length > 0 ? `
                  <p class="mb-2">
                    <strong>Motivo:</strong>
                    ${r.motivos.map(m =>
                      `${Utils.escapeHtml(m.display || m.text || m.codigo)}`
                      + (m.codigo ? ` <code>${Utils.escapeHtml(m.codigo)}</code>` : '')
                    ).join(', ')}
                  </p>` : ''}

              </div>

              <!-- Columna derecha: dosificación -->
              <div class="col-12 col-md-6">

                ${r.dosage?.dosis ? `
                  <p class="mb-2">
                    <strong>Dosis:</strong>
                    ${Utils.escapeHtml(String(r.dosage.dosis.valor))}
                    ${Utils.escapeHtml(r.dosage.dosis.unidad)}
                    ${r.dosage.dosis.codigo
                      ? `<code class="ms-1">${Utils.escapeHtml(r.dosage.dosis.codigo)}</code>`
                      : ''}
                  </p>` : ''}

                ${r.dosage?.via ? `
                  <p class="mb-2">
                    <strong>Vía:</strong>
                    ${Utils.escapeHtml(r.dosage.via.display || r.dosage.via.codigo)}
                    ${r.dosage.via.codigo
                      ? `<code class="ms-1">${Utils.escapeHtml(r.dosage.via.codigo)}</code>`
                      : ''}
                  </p>` : ''}

                ${r.dosage?.frecuencia ? `
                  <p class="mb-2">
                    <strong>Frecuencia:</strong>
                    Cada ${Utils.escapeHtml(String(r.dosage.frecuencia.valor))}
                    ${Utils.escapeHtml(r.dosage.frecuencia.unidad)}
                  </p>` : ''}

                ${duracionLabel ? `
                  <p class="mb-2">
                    <strong>Duración del tratamiento:</strong>
                    ${Utils.escapeHtml(duracionLabel)}
                    ${r.dosage?.timing?.display
                      ? `<span class="text-muted">(${Utils.escapeHtml(r.dosage.timing.display)})</span>`
                      : ''}
                  </p>` : ''}

                ${r.dosage?.texto ? `
                  <p class="mb-2">
                    <strong>Instrucción:</strong>
                    <span class="text-muted">${Utils.escapeHtml(r.dosage.texto)}</span>
                  </p>` : ''}

              </div>
            </div>

            ${r.notas ? `
              <div class="mt-3 p-2 bg-light rounded border-start border-primary border-3">
                <p class="mb-1 fw-bold">Notas:</p>
                <p class="mb-0 text-muted small">${Utils.escapeHtml(r.notas)}</p>
              </div>
            ` : ''}

          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    // Antecedentes
    resources.antecedentes?.forEach((ant) => {
      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header bg-warning text-white">
            <h4 class="mb-0">Antecedente Familiar</h4>
          </div>
          <div class="card-body">
            <p><strong>Estado:</strong> ${ant?.status || 'N/A'}</p>
            <p><strong>Relación Familiar:</strong> ${ant?.relationship?.coding?.[0]?.display || 'N/A'}</p>
            <p><strong>Condición:</strong> ${ant?.condition?.[0]?.code?.coding?.[0]?.display || 'N/A'}</p>
          </div>
        </div>
      `;
    });

   
    // Procedimientos
    if (resources.procedures?.length > 0) {
      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header bg-success text-white">
            <h4 class="mb-0">
              <i class="bx bx-plus-medical"></i>
              Procedimientos (${resources.procedures.length})
            </h4>
          </div>
          <div class="card-body">
      `;

      resources.procedures.forEach((proc, idx) => {
        const p = DataMappers.extractProcedureData(proc);
        if (!p) return;

        const statusBadge = (() => {
          const s = (p.status || '').toLowerCase();
          if (s === 'completed')   return ['bg-success',           '✅ Completado'];
          if (s === 'in-progress') return ['bg-primary',           '🔄 En progreso'];
          if (s === 'not-done')    return ['bg-danger',            '❌ No realizado'];
          if (s === 'stopped')     return ['bg-danger',            '🛑 Detenido'];
          if (s === 'preparation') return ['bg-warning text-dark', '⏳ Preparación'];
          return p.status ? ['bg-secondary', p.status] : null;
        })();

        html += `
          ${idx > 0 ? '<hr class="my-3">' : ''}
          <div class="procedure-item ${idx > 0 ? 'mt-3' : ''}">

            <!-- Encabezado: nombre + badges -->
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-1 mb-3">
              <h5 class="mb-0">
                <span class="badge bg-secondary me-1">#${idx + 1}</span>
                ${Utils.escapeHtml(
                  p.codigo?.display || p.codigoTexto || 'Sin nombre'
                )}
              </h5>
              <div class="d-flex flex-wrap gap-1">
                ${p.esOtraTecnologia
                  ? `<span class="badge bg-warning text-dark">🧩 Otra Tecnología</span>`
                  : `<span class="badge bg-info">🏥 Procedimiento</span>`}
                ${statusBadge
                  ? `<span class="badge ${statusBadge[0]}">${statusBadge[1]}</span>`
                  : ''}
              </div>
            </div>

            <div class="row g-3">

              <!-- Columna izquierda -->
              <div class="col-12 col-md-6">

                ${p.codigo?.codigo ? `
                  <p class="mb-2"><strong>Código CUPS:</strong>
                    <code>${Utils.escapeHtml(p.codigo.codigo)}</code>
                  </p>` : ''}

                ${p.codigoTexto && !p.codigo?.display ? `
                  <p class="mb-2"><strong>Descripción:</strong>
                    ${Utils.escapeHtml(p.codigoTexto)}
                  </p>` : ''}

                ${p.categoria ? `
                  <p class="mb-2"><strong>Categoría:</strong>
                    ${Utils.escapeHtml(p.categoria.display)}
                    ${p.categoria.codigo
                      ? `<code class="ms-1">${Utils.escapeHtml(p.categoria.codigo)}</code>`
                      : ''}
                  </p>` : ''}

                ${p.fechaSolicitud ? `
                  <p class="mb-2"><strong>Fecha de Solicitud:</strong>
                    ${Utils.escapeHtml(Utils.formatearFecha(p.fechaSolicitud))}
                  </p>` : ''}

                ${p.fechaRealizacion ? `
                  <p class="mb-2"><strong>Fecha de Realización:</strong>
                    ${Utils.escapeHtml(Utils.formatearFecha(p.fechaRealizacion))}
                  </p>` : ''}

                ${p.motivos.length > 0 ? `
                  <p class="mb-2"><strong>Finalidad:</strong>
                    ${p.motivos.map(m =>
                      `${Utils.escapeHtml(m.display || m.text || m.codigo)}`
                      + (m.codigo ? ` <code>${Utils.escapeHtml(m.codigo)}</code>` : '')
                    ).join(', ')}
                  </p>` : ''}

              </div>

            </div>

          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    // Observaciones (Incapacidad, Ocupación, Resultado de Procedimiento)
    if (resources.observations?.length > 0) {
      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header bg-info text-white">
            <h4 class="mb-0">
              <i class="bx bx-test-tube"></i>
              Observaciones (${resources.observations.length})
            </h4>
          </div>
          <div class="card-body">
      `;

      resources.observations.forEach((obs, idx) => {
        const o = DataMappers.extractObservationData(obs);
        if (!o) return;

        const statusBadge = (() => {
          const s = (o.status || '').toLowerCase();
          if (s === 'final')       return ['bg-success',           '✅ Final'];
          if (s === 'preliminary') return ['bg-warning text-dark', '⏳ Preliminar'];
          if (s === 'registered')  return ['bg-secondary',         '📝 Registrado'];
          if (s === 'amended')     return ['bg-info',              '✏️ Enmendado'];
          if (s === 'cancelled')   return ['bg-danger',            '❌ Cancelado'];
          return o.status ? ['bg-secondary', o.status] : null;
        })();

        const tipoBadge = (() => {
          if (o.tipoObs === 'incapacidad')            return ['bg-warning text-dark', '🩹 Incapacidad'];
          if (o.tipoObs === 'ocupacion')              return ['bg-primary',           '💼 Ocupación'];
          if (o.tipoObs === 'resultado-procedimiento')return ['bg-success',           '🔬 Resultado'];
          return ['bg-secondary', 'Observación'];
        })();

        html += `
          ${idx > 0 ? '<hr class="my-3">' : ''}
          <div class="observation-item ${idx > 0 ? 'mt-3' : ''}">

            <!-- Encabezado: nombre + badges -->
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-1 mb-3">
              <h5 class="mb-0">
                <span class="badge bg-secondary me-1">#${idx + 1}</span>
                ${Utils.escapeHtml(o.codigo?.display || o.codigoTexto || 'Sin nombre')}
              </h5>
              <div class="d-flex flex-wrap gap-1">
                <span class="badge ${tipoBadge[0]}">${tipoBadge[1]}</span>
                ${statusBadge
                  ? `<span class="badge ${statusBadge[0]}">${statusBadge[1]}</span>`
                  : ''}
              </div>
            </div>

            <div class="row g-3">

              <!-- Columna izquierda: identificación -->
              <div class="col-12 col-md-6">

                ${o.codigo?.codigo ? `
                  <p class="mb-2"><strong>Código:</strong>
                    <code>${Utils.escapeHtml(o.codigo.codigo)}</code>
                  </p>` : ''}

                ${o.codigoTexto && o.codigoTexto !== o.codigo?.display ? `
                  <p class="mb-2"><strong>Descripción:</strong>
                    ${Utils.escapeHtml(o.codigoTexto)}
                  </p>` : ''}

                ${o.fechaEfectiva ? `
                  <p class="mb-2"><strong>Fecha Efectiva:</strong>
                    ${Utils.escapeHtml(Utils.formatearFecha(o.fechaEfectiva))}
                  </p>` : ''}

                

              </div>

              <!-- Columna derecha: valores -->
              <div class="col-12 col-md-6">

                

                ${o.dispositivo ? `
                  <p class="mb-2"><strong>Dispositivo/Equipo:</strong>
                    <code>${Utils.escapeHtml(o.dispositivo)}</code>
                  </p>` : ''}

                ${o.tipoObs === 'ocupacion' && o.valor?.display ? `
                  <p class="mb-2"><strong>Ocupación (CIUO):</strong>
                    ${Utils.escapeHtml(o.valor.display)}
                    ${o.valor.codigo
                      ? `<code class="ms-1">${Utils.escapeHtml(o.valor.codigo)}</code>`
                      : ''}
                  </p>` : ''}

              </div>
            </div>

            <!-- Componentes (incapacidad, resultado procedimiento) -->
            ${o.componentes.length > 0 ? `
              <div class="mt-3">
                <p class="mb-2 fw-bold">Componentes:</p>
                <div class="table-responsive">
                  <table class="table table-sm table-bordered align-middle mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Campo</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${o.componentes.map(c => `
                        <tr>
                          <td>
                            ${c.display
                              ? `<strong>${Utils.escapeHtml(c.display)}</strong>`
                              : `<strong>${Utils.escapeHtml(c.texto)}</strong>`}
                            ${c.codigo ? `<br><code class="text-muted small">${Utils.escapeHtml(c.codigo)}</code>` : ''}
                          </td>
                          <td>
                            <span class="badge bg-primary">
                              ${Utils.escapeHtml(c.valor)}
                            </span>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : ''}

        

          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    // Factores de Riesgo (RiskAssessment)
    if (resources.riskAssessments?.length > 0) {
      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header bg-warning text-dark">
            <h4 class="mb-0">
              <i class="bx bx-shield-alt-2"></i>
              Factores de Riesgo (${resources.riskAssessments.length})
            </h4>
          </div>
          <div class="card-body">
      `;

      resources.riskAssessments.forEach((risk, idx) => {
        const r = DataMappers.extractRiskAssessmentData(risk);
        if (!r) return;

        const statusBadge = (() => {
          const s = (r.status || '').toLowerCase();
          if (s === 'final')        return ['bg-success',           '✅ Final'];
          if (s === 'registered')   return ['bg-primary',           '📝 Registrado'];
          if (s === 'preliminary')  return ['bg-warning text-dark', '⏳ Preliminar'];
          if (s === 'amended')      return ['bg-info',              '✏️ Enmendado'];
          if (s === 'corrected')    return ['bg-info',              '🔧 Corregido'];
          if (s === 'cancelled')    return ['bg-danger',            '❌ Cancelado'];
          return r.status ? ['bg-secondary', r.status] : null;
        })();

        html += `
          ${idx > 0 ? '<hr class="my-3">' : ''}
          <div class="risk-item ${idx > 0 ? 'mt-3' : ''}">

            <!-- Encabezado: nombre + badges -->
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-1 mb-3">
              <h5 class="mb-0">
                <span class="badge bg-secondary me-1">#${idx + 1}</span>
                ${Utils.escapeHtml(r.codigo?.display || r.codigoTexto || 'Sin nombre')}
              </h5>
              <div class="d-flex flex-wrap gap-1">
                ${statusBadge
                  ? `<span class="badge ${statusBadge[0]}">${statusBadge[1]}</span>`
                  : ''}
              </div>
            </div>

            <div class="row g-3">

              <!-- Columna izquierda -->
              <div class="col-12 col-md-6">

                ${r.codigo?.codigo ? `
                  <p class="mb-2"><strong>Código (FactorRiesgo):</strong>
                    <code>${Utils.escapeHtml(r.codigo.codigo)}</code>
                  </p>` : ''}

                ${r.codigoTexto && r.codigoTexto !== r.codigo?.display ? `
                  <p class="mb-2"><strong>Descripción:</strong>
                    ${Utils.escapeHtml(r.codigoTexto)}
                  </p>` : ''}

              </div>

            
            </div>

          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    // Solicitudes de Servicio (ServiceRequest)
    if (resources.serviceRequests?.length > 0) {
      html += `
        <div class="card mb-3 shadow-sm">
          <div class="card-header bg-primary text-white">
            <h4 class="mb-0">
              <i class="bx bx-file-blank"></i>
              Solicitudes de Servicio (${resources.serviceRequests.length})
            </h4>
          </div>
          <div class="card-body">
      `;

      resources.serviceRequests.forEach((svc, idx) => {
        const s = DataMappers.extractServiceRequestData(svc);
        if (!s) return;

        const statusBadge = (() => {
          const st = (s.status || '').toLowerCase();
          if (st === 'active')     return ['bg-primary',           '✅ Activa'];
          if (st === 'completed')  return ['bg-success',           '☑️ Completada'];
          if (st === 'on-hold')    return ['bg-warning text-dark', '⏸️ En espera'];
          if (st === 'cancelled')  return ['bg-danger',            '❌ Cancelada'];
          if (st === 'draft')      return ['bg-secondary',         '📝 Borrador'];
          if (st === 'revoked')    return ['bg-danger',            '🚫 Revocada'];
          return s.status ? ['bg-secondary', s.status] : null;
        })();

        const intentBadge = (() => {
          const i = (s.intent || '').toLowerCase();
          if (i === 'order')     return ['bg-primary',   '📋 Orden'];
          if (i === 'plan')      return ['bg-info',      '🗓️ Plan'];
          if (i === 'proposal')  return ['bg-secondary', '💡 Propuesta'];
          if (i === 'directive') return ['bg-warning text-dark', '⚠️ Directiva'];
          return s.intent ? ['bg-secondary', s.intent] : null;
        })();

        const prioridadBadge = (() => {
          const p = (s.prioridad || '').toLowerCase();
          if (p === 'urgent')   return ['bg-danger',  '🔴 Urgente'];
          if (p === 'asap')     return ['bg-warning text-dark', '🟡 Lo antes posible'];
          if (p === 'routine')  return ['bg-secondary', '🟢 Rutina'];
          if (p === 'stat')     return ['bg-danger',  '⚡ STAT'];
          return null;
        })();

        html += `
          ${idx > 0 ? '<hr class="my-3">' : ''}
          <div class="service-request-item ${idx > 0 ? 'mt-3' : ''}">

            <!-- Encabezado: nombre + badges -->
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-1 mb-3">
              <h5 class="mb-0">
                <span class="badge bg-secondary me-1">#${idx + 1}</span>
                ${Utils.escapeHtml(s.codigo?.display || s.codigoTexto || 'Sin nombre')}
              </h5>
              <div class="d-flex flex-wrap gap-1">
                ${intentBadge  ? `<span class="badge ${intentBadge[0]}">${intentBadge[1]}</span>`   : ''}
                ${statusBadge  ? `<span class="badge ${statusBadge[0]}">${statusBadge[1]}</span>`   : ''}
                ${prioridadBadge ? `<span class="badge ${prioridadBadge[0]}">${prioridadBadge[1]}</span>` : ''}
              </div>
            </div>

            <div class="row g-3">

              <!-- Columna izquierda -->
              <div class="col-12 col-md-6">

                ${s.codigo?.codigo ? `
                  <p class="mb-2"><strong>Código CUPS:</strong>
                    <code>${Utils.escapeHtml(s.codigo.codigo)}</code>
                  </p>` : ''}

                ${s.codigoTexto && s.codigoTexto !== s.codigo?.display ? `
                  <p class="mb-2"><strong>Descripción:</strong>
                    ${Utils.escapeHtml(s.codigoTexto)}
                  </p>` : ''}

                ${s.categoria ? `
                  <p class="mb-2"><strong>Categoría:</strong>
                    ${Utils.escapeHtml(s.categoria.display)}
                    ${s.categoria.codigo
                      ? `<code class="ms-1">${Utils.escapeHtml(s.categoria.codigo)}</code>`
                      : ''}
                  </p>` : ''}

                ${s.fechaSolicitud ? `
                  <p class="mb-2"><strong>Fecha de Solicitud:</strong>
                    ${Utils.escapeHtml(Utils.formatearFecha(s.fechaSolicitud))}
                  </p>` : ''}

            

              </div>

              <!-- Columna derecha -->
              <div class="col-12 col-md-6">

               

                ${s.motivos.length > 0 ? `
                  <p class="mb-2"><strong>Finalidad:</strong>
                    ${s.motivos.map(m =>
                      `${Utils.escapeHtml(m.display || m.text || m.codigo)}`
                      + (m.codigo ? ` <code>${Utils.escapeHtml(m.codigo)}</code>` : '')
                    ).join(', ')}
                  </p>` : ''}

               

                ${s.bodySite.length > 0 ? `
                  <p class="mb-2"><strong>Parte del Cuerpo:</strong>
                    ${s.bodySite.map(bs =>
                      `<span class="badge bg-secondary me-1">${Utils.escapeHtml(bs)}</span>`
                    ).join('')}
                  </p>` : ''}

              </div>
            </div>

          


          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

   
    const tieneExtras = Object.values(resources).some(arr => arr?.length > 0);

    if (!tieneExtras) {
      html += `
        <div class="alert alert-info" role="alert">
          <h4 class="alert-heading">ℹ️ Información Adicional</h4>
          <p>No se encontraron recursos adicionales para este paciente en este RDA.</p>
        </div>
      `;
    }

    return html;
  }
};

// ============================================================================
// 13. CONTROLADORES PRINCIPALES
// ============================================================================

const AppController = {
  async manejarConsulta() {
    try {
      const elements = DOM.elements;

      if (!elements.inputTipoDocumento) {
        return alert('Error: No se encontró el selector de tipo de documento');
      }
      if (!elements.inputDocumento) {
        return alert('Error: No se encontró el campo de número de documento');
      }

      const tipoDocumento = elements.inputTipoDocumento.value;
      const numeroDocumento = elements.inputDocumento.value;

      if (!Utils.getText(numeroDocumento).trim()) {
        alert('Por favor ingrese un número de documento');
        elements.inputDocumento.focus();
        return;
      }
      if (!Utils.getText(tipoDocumento).trim()) {
        alert('Por favor seleccione un tipo de documento');
        elements.inputTipoDocumento.focus();
        return;
      }

      // Limpiar datos previos
      InmunizacionService.limpiar();

      // Iniciarlizar variables de configuracion
      await APIService.consultarConfiguracion();

      // Iniciar consultas en paralelo
      const consultaPromises = [
        APIService.consultarComposition(tipoDocumento, numeroDocumento.trim()),
        InmunizacionService.consultar()
      ];

      // UI feedback
      const boton = elements.botonConsulta;
      const textoOriginal = boton ? boton.innerHTML : null;

      if (boton) {
        boton.disabled = true;
        boton.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Consultando...';
      }

      try {
        const [resultado] = await Promise.all(consultaPromises);

        // Guardar datos globalmente
        AppState.datosGlobalesFHIR = resultado;

        // Procesar y mostrar
        await this.procesarResultados(resultado);

        // Resetear filtro
        const filtroSelect = elements.filtroTipoEncuentro;
        if (filtroSelect) filtroSelect.value = 'todos';

        // Mostrar contenedor del filtro
        const filtroContainer = DOM.qs('.accordion-body.bg-light.border-bottom');
        if (filtroContainer) filtroContainer.style.display = 'block';
      } finally {
        if (boton) {
          boton.disabled = false;
          boton.innerHTML = textoOriginal;
        }
      }
    } catch (error) {
      console.error('❌ Error en manejarConsulta:', error);
      alert(`Error: ${error.message}`);
    }
  },

  async procesarResultados(resultado) {
    try {
     
      const paciente = resultado?.referencedResources?.patients?.[0] || null;
      UIRenderers.renderPatient(paciente);

      this.actualizarBadges(resultado?.summary);

      const todosLosDocumentos = Utils.safeArray(resultado?.entry);
      const documentosHistorial = todosLosDocumentos.filter((e) => !e?.resource?.encounter);
      const documentosEncuentros = todosLosDocumentos.filter((e) => !!e?.resource?.encounter);

      console.log(`📊 Historial: ${documentosHistorial.length}, Encuentros: ${documentosEncuentros.length}`);

      UIRenderers.renderDocumentos(documentosHistorial);

      AppState.datosEncuentrosGlobales = documentosEncuentros;
      UIRenderers.renderEncuentros(documentosEncuentros);

      DOM.setBadgeText('badgeTotalEncuentros', `Total: ${documentosEncuentros.length}`);

      UIRenderers.renderPaginacion(resultado);
    } catch (error) {
      console.error('Error procesando resultados:', error);
      throw error;
    }
  },

  actualizarBadges(summary) {
    if (summary) {
      DOM.setBadgeText('badgePaciente', `Paciente: ${summary.compositionsPaciente || 0}`);
      DOM.setBadgeText('badgeEncuentros', `Encuentros: ${summary.compositionsEncuentros || 0}`);
    }
  },

  aplicarFiltroTipoEncuentro(tipoFiltro) {
    if (!AppState.datosEncuentrosGlobales || AppState.datosEncuentrosGlobales.length === 0) {
      console.warn('⚠️ No hay datos de encuentros cargados para filtrar');
      return;
    }

    const tf = Utils.getText(tipoFiltro).toLowerCase();
    let filtrados = [];

    if (tf === 'todos' || tf === '') {
      filtrados = AppState.datosEncuentrosGlobales;
    } else {
      const mapa = {
        consulta: ['consulta','consulta externa'],
        'hospitalización': ['hospitalización', 'hospitalizacion', 'hospital'],
        urgencias: ['urgencias', 'urgencia', 'emergencia'],
        procedimiento: ['procedimiento', 'procedimientos']
      };
      const claves = mapa[tf] || [tf];

      filtrados = AppState.datosEncuentrosGlobales.filter((entry) => {
        const titulo = Utils.getText(entry?.resource?.title).toLowerCase();
        return claves.some((p) => titulo.includes(p));
      });
    }

    UIRenderers.renderEncuentros(filtrados);
    DOM.setBadgeText('badgeTotalEncuentros', `Total: ${filtrados.length}`);
  }
};

// ============================================================================
// 14. INICIALIZACIÓN
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('📱 Página cargada completamente');

  const elements = DOM.elements;

  // Botón de consulta
  if (elements.botonConsulta) {
    elements.botonConsulta.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      AppController.manejarConsulta();
    });
  } else {
    console.error('❌ No se encontró el botón consultaInfoIhce');
  }

  // Filtro de encuentros
  if (elements.filtroTipoEncuentro) {
    elements.filtroTipoEncuentro.addEventListener('change', function () {
      console.log('🔄 Filtro de encuentros cambiado a:', this.value);
      AppController.aplicarFiltroTipoEncuentro(this.value);
    });
  } else {
    console.warn('⚠️ No se encontró el selector filtroTipoEncuentro');
  }

  // Exponer para debug
  window.AppDebug = {
    controller: AppController,
    state: AppState,
    api: APIService,
    utils: Utils
  };
});
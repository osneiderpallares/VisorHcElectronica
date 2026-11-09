import express from 'express';
import { sql, connectDB } from './db.js';
import cors from 'cors';

const app = express();
const PORT = 3002;

app.use(cors()); // habilita CORS

connectDB();

/**
 * Determina el ambiente de trabajo según la tabla CONFIGURACIONES:
 *   - Si Rda_Consulta_Modo_Pruebas o Enviar_Rda_Paciente_ModPruebas tiene PARAMETRO = 1
 *     → modo pruebas → AMBIENTE 0 (sandbox)
 *   - Si ambos tienen PARAMETRO = 0 → AMBIENTE 1 (producción)
 *   - Si no existe ninguno de los dos registros → AMBIENTE 0 (por seguridad, sandbox)
 */
async function determinarAmbiente() {
    const result = await new sql.Request().query(`
        SELECT ID, NOMBRE, PARAMETRO
        FROM CONFIGURACIONES
        WHERE NOMBRE LIKE '%Rda[_]Consulta[_]Modo[_]Pruebas%'
           OR NOMBRE LIKE '%Enviar[_]Rda[_]Paciente[_]ModPruebas%'
    `);

    const registros = result.recordset || [];

    if (registros.length === 0) {
        console.warn('⚠️ No se encontraron los parámetros de modo pruebas en CONFIGURACIONES; se usa AMBIENTE 0 (sandbox)');
        return { ambiente: 0, modoPruebas: true, registros };
    }

    const modoPruebas = registros.some(r => String(r.PARAMETRO ?? '').trim() === '1');
    return { ambiente: modoPruebas ? 0 : 1, modoPruebas, registros };
}

/**
 * GET /Configuracion
 * Devuelve la fila de CONSULTAS_CONF_RDA del ambiente determinado por CONFIGURACIONES.
 * Parámetros opcionales (query string), útiles para diagnóstico:
 *   - ambiente → fuerza el AMBIENTE (ignora CONFIGURACIONES)
 *   - id       → filtra además por ID
 *   - estado   → filtra además por ESTADO
 * Ej: /Configuracion   /Configuracion?ambiente=0   /Configuracion?id=1
 */
app.get('/Configuracion/', async (req, res) => {
    try{
        const toInt = (v) => {
            if (v === undefined || v === null || v === '') return null;
            const n = Number.parseInt(v, 10);
            return Number.isNaN(n) ? NaN : n;
        };

        const id              = toInt(req.query.id);
        const ambienteForzado = toInt(req.query.ambiente);
        const estado          = toInt(req.query.estado);

        if ([id, ambienteForzado, estado].some(Number.isNaN)) {
            return res.status(400).json({ error: 'Los parámetros id, ambiente y estado deben ser numéricos' });
        }

        // Ambiente: el forzado por parámetro o el que indique CONFIGURACIONES
        let ambiente = ambienteForzado;
        let modoPruebas = null;
        if (ambiente === null) {
            const det = await determinarAmbiente();
            ambiente = det.ambiente;
            modoPruebas = det.modoPruebas;
        }

        const request = new sql.Request();
        const filtros = ['AMBIENTE = @ambiente'];
        request.input('ambiente', sql.Int, ambiente);

        if (id !== null) {
            filtros.push('ID = @id');
            request.input('id', sql.Int, id);
        }
        if (estado !== null) {
            filtros.push('ESTADO = @estado');
            request.input('estado', sql.Int, estado);
        }

        const result = await request.query(`
            SELECT ID, CLIENTE_ID, CLIENTE_SECRET, SCOPE, AMBIENTE,
                   SUBSCRIPTIONKEY, TENANTID, ESTADO, URL
            FROM CONSULTAS_CONF_RDA
            WHERE ${filtros.join(' AND ')}
            ORDER BY ID
        `);
        // recordset es un array con los resultados
        if (!result.recordset || result.recordset.length === 0) {
        return res.status(404).json({ error: `Configuración no encontrada para AMBIENTE ${ambiente}` });
        }

        // Si hay varias filas para el mismo ambiente se usa la de menor ID
        const conf = result.recordset[0];

        res.json({
        mensaje: '✅ Consulta exitosa',
        ambiente,
        modoPruebas,
        total: result.recordset.length,
        datos: conf
        });
    }  catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en la consulta' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en http://localhost:${PORT}`);
});

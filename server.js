import express from 'express';
import { sql, connectDB } from './db.js';
import cors from 'cors';

const app = express();
const PORT = 3002;

app.use(cors()); // habilita CORS

connectDB();

/**
 * GET /Configuracion
 * Parámetros opcionales (query string):
 *   - id       → filtra por ID
 *   - ambiente → filtra por AMBIENTE (si no se envía, usa process.env.AMBIENTE si existe)
 *   - estado   → filtra por ESTADO (por defecto 1)
 * Ej: /Configuracion?ambiente=0   /Configuracion?id=1
 */
app.get('/Configuracion/', async (req, res) => {
    try{
        const toInt = (v) => {
            if (v === undefined || v === null || v === '') return null;
            const n = Number.parseInt(v, 10);
            return Number.isNaN(n) ? NaN : n;
        };

        const id       = toInt(req.query.id);
        const ambiente = toInt(req.query.ambiente ?? process.env.AMBIENTE);
        const estado   = toInt(req.query.estado) ?? 1;

        if ([id, ambiente, estado].some(Number.isNaN)) {
            return res.status(400).json({ error: 'Los parámetros id, ambiente y estado deben ser numéricos' });
        }

        const request = new sql.Request();
        const filtros = ['ESTADO = @estado'];
        request.input('estado', sql.Int, estado);

        if (id !== null) {
            filtros.push('ID = @id');
            request.input('id', sql.Int, id);
        }
        if (ambiente !== null) {
            filtros.push('AMBIENTE = @ambiente');
            request.input('ambiente', sql.Int, ambiente);
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
        return res.status(404).json({ error: 'Configuración no encontrada' });
        }

        // Si hay resultados, puedes devolver el primero o todos
        const conf = result.recordset[0];

        res.json({
        mensaje: '✅ Consulta exitosa',
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

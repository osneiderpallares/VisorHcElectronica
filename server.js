import express from 'express';
import { sql, connectDB } from './db.js';
import cors from 'cors';

const app = express();
const PORT = 3002;

app.use(cors()); // habilita CORS

connectDB();

app.get('/Configuracion/', async (req, res) => {
    try{
        const result = await sql.query`SELECT * FROM CONSULTAS_CONF_RDA`;
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

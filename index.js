
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import fhirRoutes from './src/routes/index.js';
import documentReferenceRoutes from './src/routes/documentReference.js';
import inmunizacionRouter from './src/routes/index.js';  // <= nombre y ruta reales
// (No dupliques documentRoutes y documentReferenceRoutes)

const app = express();

app.use(express.json());
app.use(cors());
app.use('/api', inmunizacionRouter); 


app.get('/__routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach((m) => {
    if (m.route && m.route.path) {
      const methods = Object.keys(m.route.methods).join(',').toUpperCase();
      routes.push({ path: m.route.path, methods });
    } else if (m.name === 'router' && m.handle.stack) {
      m.handle.stack.forEach((h) => {
        const route = h.route;
        if (route) {
          const methods = Object.keys(route.methods).join(',').toUpperCase();
          routes.push({ path: (m.regexp?.toString() || '') + (route.path || ''), methods });
        }
      });
    }
  });
  res.json(routes);
});



// __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Frontend estático
app.use(express.static(path.join(__dirname, 'src', 'public')));

// ✅ MONTAJES CLAROS Y ÚNICOS
app.use('/api', fhirRoutes);                 // /api/...
app.use('/api', documentReferenceRoutes);
  

// (Si aún quieres exponer vistas bajo /visor, puedes servir sólo HTML, no la API)
app.use('/visor', express.static(path.join(__dirname, 'src', 'pages')));

// Ruta principal del visor
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'pages', 'visor.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`App running on http://localhost:${PORT}`));

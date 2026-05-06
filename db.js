import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  port: 49170,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

async function connectDB() {
  try {
    await sql.connect(config);
    console.log('✅ Conectado a SQL Server');
  } catch (err) {
    console.error('❌ Error de conexión:', err);
  }
}

export { sql, connectDB }; 

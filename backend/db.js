const { Pool } = require('pg');
require('dotenv').config();

// Konfiguracja polaczenia budowana na podstawie zmiennych z pliku .env
// (patrz .env.example - PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD)
const config = {
  host: process.env.PGHOST || process.env.DB_SERVER || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || process.env.DB_NAME || 'mechanikapp',
  user: process.env.PGUSER || process.env.DB_USER || 'postgres',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
  // Wlacz SSL do bazy (np. polaczenie z hostowanym Postgresem w chmurze) przez PGSSL=true
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
};

const pool = new Pool(config);

pool.on('error', (err) => {
  console.error('[DB] Blad puli polaczen PostgreSQL:', err.message);
});

// poolPromise zachowany dla zgodnosci z dawniejszym API (server.js/routes
// robily `const pool = await poolPromise;`) - tutaj po prostu sprawdzamy,
// ze polaczenie dziala, i zwracamy ten sam obiekt pool.
const poolPromise = pool
  .connect()
  .then((client) => {
    client.release();
    console.log('Polaczono z baza danych PostgreSQL (' + config.database + ')');
    return pool;
  })
  .catch((err) => {
    console.error(
      '[DB] Nie udalo sie polaczyc z baza danych:', err.message,
      '\n[DB] Sprawdz: czy serwer PostgreSQL dziala, czy dane w .env (PGHOST/PGPORT/',
      'PGDATABASE/PGUSER/PGPASSWORD) sa poprawne, i czy firewall nie blokuje polaczenia.'
    );
    throw err;
  });

module.exports = {
  pool,
  poolPromise,
  query: (text, params) => pool.query(text, params),
};

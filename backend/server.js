const express = require('express');
const https   = require('https');
const http    = require('http');
const cors    = require('cors');
const path    = require('path');
const os      = require('os');
const fs      = require('fs');
require('dotenv').config();

const { pool, poolPromise } = require('./db');
const authRoutes       = require('./routes/auth');
const usersRoutes      = require('./routes/users');
const carsRoutes       = require('./routes/cars');
const jobsRoutes       = require('./routes/jobs');
const gospodarczeRoutes = require('./routes/gospodarcze');
const predefiniowaneRoutes = require('./routes/predefiniowane');
const { router: followupRoutes } = require('./routes/followup');
const reportsRoutes = require('./routes/reports');

const app = express();

app.use(cors());
app.use(express.json({ limit: '15mb' })); // limit podniesiony ze wzgledu na zdjecia (base64) dolaczane do zlecen

app.use('/api/auth',       authRoutes);
app.use('/api/users',      usersRoutes);
app.use('/api/cars',       carsRoutes);
app.use('/api/jobs',       jobsRoutes);
app.use('/api/gospodarcze', gospodarczeRoutes);
app.use('/api/predefiniowane-prace', predefiniowaneRoutes);
app.use('/api/followup', followupRoutes);
app.use('/api/reports', reportsRoutes);

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) {
      res.status(200).send(
        'Backend działa. Zbuduj frontend: npm run build w folderze frontend.'
      );
    }
  });
});

const PORT      = process.env.PORT      || 4000;
const PORT_HTTP = process.env.PORT_HTTP || 4080;

// Uruchamia schema.sql przy starcie (CREATE TABLE IF NOT EXISTS + seed danych
// startowych, w calosci idempotentne - patrz backend/schema.sql). Zastepuje to
// dawny (MSSQL) system dziesiatek malych, przyrostowych migracji "IF NOT EXISTS
// kolumna X -> ALTER TABLE" - teraz schema.sql od razu tworzy docelowy ksztalt
// bazy, wiec nie ma czego przyrostowo migrowac.
//
// schema.sql zawiera psql-owa dyrektywe `\ir predefiniowane_prace_seed.sql`
// (przydatna przy recznym uruchamianiu przez `psql -f schema.sql`) - poniewaz
// nie jest to zwykly SQL i node'owy sterownik `pg` go nie zrozumie, przy
// automatycznym uruchamianiu z poziomu backendu podmieniamy te linie na
// rzeczywista zawartosc pliku przed wykonaniem.
async function runSchema() {
  console.log('[Migracja] Sprawdzanie schematu bazy danych...');

  const schemaPath = path.join(__dirname, 'schema.sql');
  let schemaSql = fs.readFileSync(schemaPath, 'utf8');

  schemaSql = schemaSql.replace(
    /^\\ir\s+(\S+)\s*$/m,
    (_match, includedFile) => fs.readFileSync(path.join(__dirname, includedFile), 'utf8')
  );

  await pool.query(schemaSql);

  console.log('[Migracja] Schemat aktualny.');
}

// Wczytaj certyfikaty SSL (wygenerowane przez mkcert)
function loadSSL() {
  const certFile = path.join(__dirname, '192.168.22.34+2.pem');
  const keyFile  = path.join(__dirname, '192.168.22.34+2-key.pem');

  if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
    console.warn('[SSL] Brak plikow certyfikatu — serwer uruchomi sie tylko na HTTP.');
    console.warn('[SSL] Uruchom w folderze backend:');
    console.warn('[SSL]   mkcert 192.168.22.34 localhost 127.0.0.1');
    return null;
  }

  return {
    cert: fs.readFileSync(certFile),
    key:  fs.readFileSync(keyFile),
  };
}

// Uruchom serwer po migracji
poolPromise
  .then(() => runSchema())
  .then(() => {
    const ssl = loadSSL();

    if (ssl) {
      // HTTPS — glowny serwer
      https.createServer(ssl, app).listen(PORT, '0.0.0.0', () => {
        console.log(`\n✅ Backend HTTPS działa na porcie ${PORT}`);
        console.log('Dostępny pod adresami:');
        console.log(`  https://localhost:${PORT}`);
        const interfaces = os.networkInterfaces();
        Object.values(interfaces).forEach((list) => {
          (list || []).forEach((iface) => {
            if (iface.family === 'IPv4' && !iface.internal) {
              console.log(`  https://${iface.address}:${PORT}  <-- użyj tego na telefonie`);
            }
          });
        });
      });

      // HTTP -> HTTPS przekierowanie (port 4080)
      http.createServer((req, res) => {
        const host = req.headers.host?.replace(`:${PORT_HTTP}`, `:${PORT}`) || `192.168.22.34:${PORT}`;
        res.writeHead(301, { Location: `https://${host}${req.url}` });
        res.end();
      }).listen(PORT_HTTP, '0.0.0.0', () => {
        console.log(`↩️  Przekierowanie HTTP działa na porcie ${PORT_HTTP} (-> HTTPS)`);
      });

    } else {
      // Fallback: sam HTTP jesli brak certow
      http.createServer(app).listen(PORT, '0.0.0.0', () => {
        console.log(`\n⚠️  Backend HTTP (bez SSL) działa na porcie ${PORT}`);
        const interfaces = os.networkInterfaces();
        Object.values(interfaces).forEach((list) => {
          (list || []).forEach((iface) => {
            if (iface.family === 'IPv4' && !iface.internal) {
              console.log(`  http://${iface.address}:${PORT}`);
            }
          });
        });
      });
    }
  })
  .catch((err) => {
    console.error('[BLAD] Nie można połączyć się z bazą danych lub wykonać migracji:', err.message);
    process.exit(1);
  });

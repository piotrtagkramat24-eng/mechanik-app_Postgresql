// Tworzy nowe konto uzytkownika bezposrednio w bazie, z haslem od razu
// zahaszowanym (bcrypt) - do uzycia zamiast usunietych INSERT-ow z schema.sql
// (ktore seedowaly konta demo z haslem '1234' - niepotrzebne/niebezpieczne
// teraz, gdy aplikacja dziala na prawdziwym serwerze z prawdziwymi danymi).
//
// Uzycie (z folderu backend/):
//   node create-user.js <login> <haslo> <"Imie Nazwisko"> <rola>
//
// Dostepne role: szef, kierownik, mechanik, pracownik_gospodarczy, administrator, superadmin
//
// Przyklad:
//   node create-user.js jkowalski "MojeMocneHaslo123" "Jan Kowalski" szef

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const DOZWOLONE_ROLE = ['szef', 'kierownik', 'mechanik', 'pracownik_gospodarczy', 'administrator', 'superadmin'];

async function main() {
  const [username, password, fullName, role] = process.argv.slice(2);

  if (!username || !password || !fullName || !role) {
    console.error('Użycie: node create-user.js <login> <hasło> "<Imię Nazwisko>" <rola>');
    console.error(`Dostępne role: ${DOZWOLONE_ROLE.join(', ')}`);
    process.exit(1);
  }

  if (!DOZWOLONE_ROLE.includes(role)) {
    console.error(`Nieznana rola "${role}". Dostępne role: ${DOZWOLONE_ROLE.join(', ')}`);
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('Hasło musi mieć co najmniej 6 znaków.');
    process.exit(1);
  }

  try {
    const istnieje = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (istnieje.rows.length > 0) {
      console.error(`Login "${username}" już istnieje w bazie.`);
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password, full_name, role) VALUES ($1, $2, $3, $4)',
      [username, hash, fullName, role]
    );

    console.log(`Utworzono konto "${username}" (${fullName}, rola: ${role}).`);
  } catch (err) {
    console.error('Błąd podczas tworzenia konta:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

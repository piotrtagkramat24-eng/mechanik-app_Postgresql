// Wysylka maili przez Microsoft Graph API (Azure AD app - client credentials flow).
//
// Oczekiwane zmienne w .env:
//   MICROSOFT_TENANT_ID     - Tenant ID organizacji w Azure AD
//   MICROSOFT_CLIENT_ID     - Client ID aplikacji zarejestrowanej w Azure AD
//   MICROSOFT_CLIENT_SECRET - Client Secret tej aplikacji
//   EMAIL_FROM_ADDRESS      - skrzynka, z ktorej wysylane sa maile (musi miec
//                             nadane uprawnienie aplikacji Mail.Send w Azure AD)
//   EMAIL_FROM_NAME         - nazwa nadawcy widoczna w mailu (opcjonalnie)
//
// Jesli MICROSOFT_TENANT_ID nie jest ustawiony, wysylka jest po prostu pomijana
// (bez bledu) - dzieki temu apka dziala normalnie nawet bez skonfigurowanej poczty.

let brakKonfiguracjiOstrzezenieWypisane = false;
let cachedToken = null; // { accessToken, expiresAt } w pamieci procesu
let cachedSuperadminEmail; // undefined = jeszcze nie sprawdzono, null = brak/pusty, string = adres

// Pobiera (i cache'uje w pamieci procesu) adres e-mail konta 'superadmin1'.
// Wymagane, zeby KAZDY mail wysylany z aplikacji trafial rowniez do
// superadmina (patrz wyslijMaila nizej) — niezaleznie od tego, jaki route
// go wysyla. Lazy-require('./db'), zeby uniknac ewentualnego cyklu importow.
async function pobierzEmailSuperadmina() {
  if (cachedSuperadminEmail !== undefined) return cachedSuperadminEmail;
  try {
    const { pool } = require('./db');
    const result = await pool.query(
      `SELECT email AS "Email" FROM users WHERE username = 'superadmin1'`
    );
    cachedSuperadminEmail = result.rows[0]?.Email || null;
  } catch (err) {
    console.error('[Mail] Nie udalo sie pobrac adresu superadmina:', err.message);
    cachedSuperadminEmail = null;
  }
  return cachedSuperadminEmail;
}

function skonfigurowano() {
  return Boolean(
    process.env.MICROSOFT_TENANT_ID &&
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET &&
      process.env.EMAIL_FROM_ADDRESS
  );
}

// Pobiera (i cache'uje w pamieci) token dostepu do Microsoft Graph API
// metoda client credentials (aplikacja loguje sie sama jako aplikacja,
// bez udzialu uzytkownika).
async function pobierzToken() {
  const teraz = Date.now();
  if (cachedToken && cachedToken.expiresAt > teraz + 60_000) {
    return cachedToken.accessToken;
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const dane = await resp.json();
  if (!resp.ok) {
    throw new Error(
      `Blad pobierania tokenu Azure AD: ${dane.error} - ${dane.error_description || ''}`
    );
  }

  cachedToken = {
    accessToken: dane.access_token,
    expiresAt: teraz + dane.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

// wyslijMaila({ to: ['a@x.pl','b@x.pl'], subject, text, html })
async function wyslijMaila({ to, subject, text, html }) {
  let odbiorcy = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);

  // Kazdy mail wysylany z aplikacji ma isc rowniez do superadmina
  // (konto 'superadmin1'), niezaleznie od tego, co go wywolalo.
  const superadminEmail = await pobierzEmailSuperadmina();
  if (superadminEmail && !odbiorcy.some((a) => a.toLowerCase() === superadminEmail.toLowerCase())) {
    odbiorcy = [...odbiorcy, superadminEmail];
  }

  if (!skonfigurowano()) {
    if (!brakKonfiguracjiOstrzezenieWypisane) {
      console.warn(
        '[Mail] Brak konfiguracji Microsoft Graph API (MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID / ' +
          'MICROSOFT_CLIENT_SECRET / EMAIL_FROM_ADDRESS w .env) - powiadomienia mailowe sa wylaczone.'
      );
      brakKonfiguracjiOstrzezenieWypisane = true;
    }
    return;
  }
  if (odbiorcy.length === 0) return;

  try {
    const token = await pobierzToken();
    const fromAddress = process.env.EMAIL_FROM_ADDRESS;

    const wiadomosc = {
      message: {
        subject,
        body: {
          contentType: html ? 'HTML' : 'Text',
          content: html || text || '',
        },
        toRecipients: odbiorcy.map((adres) => ({
          emailAddress: { address: adres },
        })),
      },
      saveToSentItems: true,
    };

    // Wysylka "w imieniu" skrzynki EMAIL_FROM_ADDRESS - aplikacja w Azure AD
    // musi miec nadane uprawnienie aplikacji (Application permission) Mail.Send.
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(wiadomosc),
      }
    );

    if (!resp.ok) {
      const tresc = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${tresc}`);
    }

    console.log(`[Mail] Wyslano do: ${odbiorcy.join(', ')} - "${subject}"`);
  } catch (err) {
    // Blad wysylki maila nie moze wywalic reszty operacji (np. zakonczenia roboty),
    // wiec tylko logujemy.
    console.error('[Mail] Blad wysylki:', err.message);
  }
}

// Buduje spojny, profesjonalny szablon HTML dla wszystkich maili wysylanych
// z aplikacji (powiadomienia o przydzieleniu, zakonczeniu itp.). Przyjmuje
// gotowe HTML jako tresc (akapity/tabelka), a caly "obudowuje" naglowkiem,
// stopka i jednolitym stylem — zeby maile wygladaly profesjonalnie i
// spojnie, niezaleznie od tego, ktory route je wysyla.
function szablonEmail({ tytul, preheader = '', trescHtml, stopkaDodatkowa = '' }) {
  const nazwaNadawcy = process.env.EMAIL_FROM_NAME || 'System Ewidencji Warsztatu';
  return `<!DOCTYPE html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${tytul}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f3f4f6; font-family:Segoe UI, Arial, Helvetica, sans-serif;">
    <span style="display:none; font-size:1px; color:#f3f4f6; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      ${preheader}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%; background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background-color:#1f2937; padding:20px 28px;">
                <span style="color:#ffffff; font-size:16px; font-weight:700; letter-spacing:.2px;">🔧 ${nazwaNadawcy}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 16px; font-size:18px; color:#111827; font-weight:700;">${tytul}</h1>
                <div style="font-size:14px; line-height:1.6; color:#374151;">
                  ${trescHtml}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px; background-color:#f9fafb; border-top:1px solid #e5e7eb;">
                <p style="margin:0; font-size:12px; color:#9ca3af; line-height:1.5;">
                  Wiadomość wygenerowana automatycznie przez system ewidencji warsztatu — prosimy na nią nie odpowiadać.
                  ${stopkaDodatkowa}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Prosty escaping HTML dla wartosci wstawianych do szablonu maila (dane
// pochodza z bazy - marka, model, opisy uzytkownikow itp. - wiec nie mozna
// ich wstawiac bez escapowania).
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br />');
}

// Buduje prosta tabelke "etykieta: wartosc" uzywana w tresci maili
// (np. Pojazd / Opis / Priorytet). Pomija wiersze bez wartosci.
function tabelkaSzczegolow(wiersze) {
  const widoczne = wiersze.filter((w) => w && w.wartosc !== undefined && w.wartosc !== null && String(w.wartosc).trim() !== '');
  if (widoczne.length === 0) return '';
  const wierszeHtml = widoczne
    .map(
      (w) => `
        <tr>
          <td style="padding:4px 12px 4px 0; color:#6b7280; font-size:13px; white-space:nowrap; vertical-align:top;">${escapeHtml(w.etykieta)}</td>
          <td style="padding:4px 0; color:#111827; font-size:13px; vertical-align:top;">${escapeHtml(w.wartosc)}</td>
        </tr>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0; width:100%;">${wierszeHtml}</table>`;
}

module.exports = { wyslijMaila, szablonEmail, escapeHtml, tabelkaSzczegolow };

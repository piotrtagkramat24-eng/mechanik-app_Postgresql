# Warsztat App v13 — PWA + HTTPS Setup

## Co nowego w v13

- ✅ **PWA** — aplikacja instaluje się na Androidzie i iPhone jako natywna apka
- ✅ **HTTPS** — konfiguracja nginx z SSL (self-signed lub Let's Encrypt)
- ✅ **Poprawki mobilne** — naprawiono scrollowanie w zakładce Szef → Pracownik gospodarczy
- ✅ **Responsive fixes** — kanban, tabs, formularze działają poprawnie na telefonie
- ✅ **Touch targets** — większe przyciski i pola na urządzeniach dotykowych
- ✅ **Safe area** — obsługa wycięć (notch) iPhone'a

---

## Instalacja na telefonie (PWA)

### Android (Chrome)
1. Otwórz aplikację w Chrome
2. Kliknij **⋮ menu** → **"Dodaj do ekranu głównego"**
3. Gotowe! Apka działa jak natywna

### iPhone / iPad (Safari)
1. Otwórz aplikację w **Safari** (tylko Safari obsługuje PWA na iOS)
2. Kliknij **📤 Udostępnij** → **"Dodaj do ekranu głównego"**
3. Gotowe!

> **Uwaga**: HTTPS jest wymagane do instalacji PWA. Działa też na `localhost` podczas developmentu.

---

## Konfiguracja HTTPS

### Opcja A: Self-signed cert (szybko, do sieci lokalnej)

```bash
# Na serwerze (jako root):
sudo bash setup-ssl.sh
```

Skrypt automatycznie:
- Generuje certyfikat SSL ważny 10 lat
- Instaluje i konfiguruje nginx
- Przekierowuje HTTP → HTTPS

**Na telefonie trzeba jednorazowo zaakceptować certyfikat:**
1. Wejdź na `https://IP_SERWERA`
2. Kliknij "Zaawansowane" → "Przejdź mimo to"
3. Teraz można instalować PWA

### Opcja B: Let's Encrypt (jeśli masz domenę)

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d twoja-domena.pl
```

### Opcja C: Lokalne HTTPS przez mkcert (dev)

```bash
# Instaluj mkcert
apt install mkcert
mkcert -install
mkcert localhost 192.168.1.100  # twoje IP

# Uruchom z certami:
cd frontend && vite --https --cert localhost.pem --key localhost-key.pem
```

---

## Budowanie i uruchomienie

```bash
# Backend
cd backend
npm install
cp .env.example .env   # uzupełnij dane do DB
npm start

# Frontend (development)
cd frontend
npm install
npm run dev

# Frontend (produkcja)
cd frontend
npm run build
# Pliki trafiają do frontend/dist/ — nginx serwuje je
```

---

## Struktura projektu

```
mechanik-app-v13/
├── frontend/
│   ├── public/
│   │   ├── manifest.json    ← PWA manifest
│   │   ├── sw.js            ← Service Worker
│   │   └── icons/           ← Ikony PWA (192 i 512px)
│   ├── index.html           ← z meta tagami PWA
│   └── src/
│       └── index.css        ← z responsive fixes
├── backend/
├── nginx-ssl.conf           ← konfiguracja nginx z SSL
└── setup-ssl.sh             ← skrypt do szybkiej instalacji SSL
```

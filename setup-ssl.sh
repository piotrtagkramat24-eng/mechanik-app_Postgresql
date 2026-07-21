#!/bin/bash
# ============================================================
# Skrypt: Generowanie self-signed certyfikatu SSL
# Uruchom jako root na serwerze: sudo bash setup-ssl.sh
# ============================================================

set -e

echo "=== Warsztat SSL Setup ==="

# Pobierz IP serwera (lub wpisz domenę)
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "Wykryto IP serwera: $SERVER_IP"

# Stwórz katalog na certyfikaty jeśli nie istnieje
mkdir -p /etc/ssl/private

# Generuj self-signed cert (ważny 10 lat)
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/ssl/private/warsztat.key \
    -out /etc/ssl/certs/warsztat.crt \
    -subj "/C=PL/ST=Mazovia/L=Wyszkow/O=Warsztat/CN=$SERVER_IP" \
    -addext "subjectAltName=IP:$SERVER_IP"

chmod 600 /etc/ssl/private/warsztat.key
chmod 644 /etc/ssl/certs/warsztat.crt

echo ""
echo "✅ Certyfikat wygenerowany!"
echo "   Certyfikat: /etc/ssl/certs/warsztat.crt"
echo "   Klucz:      /etc/ssl/private/warsztat.key"
echo ""
echo "=== Instalacja Nginx ==="
apt-get update -q && apt-get install -y nginx

# Kopiuj konfigurację nginx
cp nginx-ssl.conf /etc/nginx/sites-available/warsztat

# Podmieniamy IP w konfiguracji
sed -i "s/server_name _;/server_name $SERVER_IP;/g" /etc/nginx/sites-available/warsztat

# Aktywuj site
ln -sf /etc/nginx/sites-available/warsztat /etc/nginx/sites-enabled/warsztat
rm -f /etc/nginx/sites-enabled/default

# Testuj i restartuj nginx
nginx -t && systemctl restart nginx && systemctl enable nginx

echo ""
echo "✅ Nginx skonfigurowany z SSL!"
echo ""
echo "=== WAŻNE: Instalacja na telefonie ==="
echo ""
echo "Ponieważ używasz self-signed certyfikatu, musisz go zaakceptować w przeglądarce."
echo "Na Androidzie/iOS:"
echo "  1. Otwórz https://$SERVER_IP w Chrome/Safari"
echo "  2. Kliknij 'Zaawansowane' -> 'Przejdź mimo to'"
echo "  3. Po zaakceptowaniu pojawi się przycisk 'Dodaj do ekranu głównego'"
echo ""
echo "Aplikacja będzie dostępna pod: https://$SERVER_IP"

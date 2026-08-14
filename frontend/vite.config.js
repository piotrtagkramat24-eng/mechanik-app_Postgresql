import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 0.0.0.0 - dostepne z innych urzadzen w sieci lokalnej (telefon, tablet), nie tylko z localhost
    port: 5173,
    proxy: {
      // Kazde zapytanie do /api jest przekazywane do backendu dzialajacego
      // na tym samym komputerze. Dzieki temu frontend nie musi znac
      // adresu IP serwera - dziala to samo na komputerze, telefonie i tablecie.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});

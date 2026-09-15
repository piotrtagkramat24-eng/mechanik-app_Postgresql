// Generuje prawdziwy plik .xlsx (nie CSV) i od razu go pobiera w przegladarce.
//
// "exceljs" jest importowany dynamicznie (dopiero w momencie kliknieca
// "Eksportuj"), zeby jego spora waga nie obciazala glownego bundla
// aplikacji - Vite tworzy dla niego osobny, doladowywany na zadanie chunk.
//
// W przeciwienstwie do wczesniejszego eksportu CSV, liczby i daty trafiaja
// do arkusza jako PRAWDZIWE typy Excela (nie tekst), wiec od razu da sie
// je sumowac/sortowac/filtrowac w Excelu - to byla glowna wada CSV.

const KOLOR_NAGLOWKA = 'FF3B72F6'; // --accent
const KOLOR_NAGLOWKA_TEKST = 'FFFFFFFF';
const KOLOR_ZEBRA = 'FFF6F8FC';

// arkusze: [{ nazwa, kolumny: [{ naglowek, klucz, szerokosc, numFmt }], wiersze: [{...}] }]
export async function pobierzXlsx(nazwaPliku, arkusze) {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Warsztat';
  wb.created = new Date();

  for (const arkusz of arkusze) {
    const ws = wb.addWorksheet(arkusz.nazwa, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = arkusz.kolumny.map((k) => ({
      header: k.naglowek,
      key: k.klucz,
      width: k.szerokosc || 18,
      style: k.numFmt ? { numFmt: k.numFmt } : undefined,
    }));

    const headerRow = ws.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: KOLOR_NAGLOWKA_TEKST } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KOLOR_NAGLOWKA } };
      cell.alignment = { vertical: 'middle' };
    });

    arkusz.wiersze.forEach((wiersz, i) => {
      const row = ws.addRow(wiersz);
      if (i % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KOLOR_ZEBRA } };
        });
      }
    });

    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: arkusz.kolumny.length },
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nazwaPliku;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

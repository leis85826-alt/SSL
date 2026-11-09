# Local document parsing components

- ExcelJS 4.4.0: browser build from the official npm package `exceljs@4.4.0`, MIT; see exceljs-LICENSE.txt.
- PDF.js 4.10.38: browser module and worker from the official npm package `pdfjs-dist@4.10.38`, Apache-2.0; see pdfjs-LICENSE.txt.

These files are loaded on demand from this site's own origin, not a runtime CDN. Excel formulas and PDF JavaScript are not executed by the extraction workflow. Only extracted text and source locations are submitted to the user's configured model provider. Old binary .xls requires conversion to .xlsx/CSV. Scanned PDFs require external OCR.

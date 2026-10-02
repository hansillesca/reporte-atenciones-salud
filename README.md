# Dashboard público - JSON pequeños

Esta versión divide automáticamente la información en archivos `chunk_XXX.json` de aproximadamente 8 MB o menos, pensados para poder subirse desde la interfaz web de GitHub.

## Actualizar datos

1. Mantén tus Excel en `D:\BASE DE DATOS`.
2. Ejecuta `GENERAR_JSON.bat`.
3. En `data/` se generarán:
   - `index.json`
   - `metadata.json`
   - `chunk_001.json`
   - `chunk_002.json`
   - etc.
4. Sube esos archivos a GitHub junto con `app.js`, `index.html` y `styles.css`.

No subas los Excel originales.

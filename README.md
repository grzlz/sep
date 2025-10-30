# SEP Data Scraper

Web scraper automatizado para extraer estadísticas educativas del sitio oficial de la [Secretaría de Educación Pública (SEP)](https://www.planeacion.sep.gob.mx/principalescifras/) de México.

## ¿Qué hace?

Extrae datos educativos de los 32 estados mexicanos y sus municipios, incluyendo:
- Número de escuelas
- Total de alumnos (desagregado por género)
- Cantidad de docentes

Los datos se exportan en formato JSON y pueden convertirse a CSV para análisis.

## Uso rápido

```bash
cd sep-scraper

# Instalar dependencias
npm install
npm run install-browser

# Ejecutar scraper
npm run scrape

# Convertir JSON a CSV
node json-to-csv.js
```

## Estructura del proyecto

```
sep/
├── sep-scraper/          # Scraper principal y documentación detallada
│   ├── scraper.js        # Script de scraping con Playwright
│   ├── json-to-csv.js    # Convertidor de datos
│   ├── data/             # Datos extraídos (JSON por estado)
│   └── README.md         # Documentación completa del scraper
```

## Documentación completa

Para información detallada sobre arquitectura, configuración y uso avanzado, consulta:

**[sep-scraper/README.md](./sep-scraper/README.md)**

## Tecnologías

- **Node.js** (ES modules)
- **Playwright** - Automatización del navegador
- **Chromium** - Navegador headless

## Licencia

MIT

---

**Nota**: Este proyecto no está afiliado con la SEP. Es una herramienta independiente para facilitar el acceso a datos públicos.

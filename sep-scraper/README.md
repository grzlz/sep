# SEP Scraper

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![Playwright](https://img.shields.io/badge/playwright-%5E1.40.0-orange.svg)

Scraper automatizado para extraer estadisticas educativas del sitio oficial de la Secretaria de Educacion Publica (SEP) de Mexico.

## 📋 Descripcion

Este proyecto automatiza la extraccion de datos del sistema [Principales Cifras del SEP](https://www.planeacion.sep.gob.mx/principalescifras/), permitiendo obtener estadisticas educativas de los 32 estados de Mexico y sus municipios de manera programatica.

El scraper utiliza Playwright para navegar por el sitio web basado en ASP.NET WebForms, manejando automaticamente la autenticacion y los estados de sesion (ViewState, EventValidation) necesarios para interactuar con los formularios dinamicos.

### Por que usar este proyecto?

- **Automatizacion completa**: Elimina la necesidad de extraer datos manualmente estado por estado
- **Datos estructurados**: Convierte tablas HTML en JSON limpio y facil de procesar
- **Escalable**: Procesa desde un solo estado hasta los 32 estados de manera automatica
- **Confiable**: Maneja tiempos de espera y navegacion compleja en sitios ASP.NET legacy
- **Open Source**: Codigo abierto bajo licencia MIT, listo para extender y adaptar

## ✨ Caracteristicas

- Extraccion automatizada de datos para 32 estados mexicanos
- Descarga de estadisticas a nivel estado y municipio
- Captura de metricas educativas clave:
  - Numero de escuelas
  - Total de alumnos (desagregado por genero)
  - Cantidad de docentes
- Exportacion en formato JSON estructurado
- Navegacion headless con Chromium (Playwright)
- Manejo robusto de formularios ASP.NET WebForms
- Sistema de timeouts configurables para estabilidad

## 🚀 Instalacion

### Requisitos previos

- Node.js >= 18.0.0
- npm >= 9.0.0

### Pasos de instalacion

1. Clona el repositorio:

```bash
git clone https://github.com/tu-usuario/sep-scraper.git
cd sep-scraper
```

2. Instala las dependencias:

```bash
npm install
```

3. Instala el navegador Chromium de Playwright:

```bash
npm run install-browser
```

## 💻 Uso

### Uso basico

Por defecto, el scraper extrae datos de un solo estado (Aguascalientes) como prueba:

```bash
npm run scrape
```

Esto generara un archivo `data/aguascalientes.json` con las estadisticas del estado.

### Uso avanzado

#### Scraping de todos los estados

Edita `scraper.js` y descomenta la seccion de loop completo (lineas 154-159):

```javascript
for (const state of states) {
  const data = await scrapeState(page, state, false);
  const filename = `${OUTPUT_DIR}/${state.name.toLowerCase().replace(/\s+/g, '_')}.json`;
  writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`✅ Saved: ${filename}`);
}
```

Luego ejecuta:

```bash
npm run scrape
```

#### Scraping de municipios individuales

Para obtener datos de cada municipio por separado (en lugar de datos agregados a nivel estado), modifica la llamada a `scrapeState`:

```javascript
const data = await scrapeState(page, state, true); // true = incluir todos los municipios
```

Esto generara un JSON con datos desagregados por municipio dentro de cada estado.

### Ejemplo de salida

El scraper genera archivos JSON con la siguiente estructura:

```json
{
  "state": "AGUASCALIENTES",
  "stateCode": "1",
  "tables": [
    {
      "tableIndex": 0,
      "data": [
        ["Municipio", "Escuelas", "Alumnos", "Alumnos Mujeres", "Alumnos Hombres", "Docentes"],
        ["AGUASCALIENTES", "1,237", "276,831", "141,063", "135,768", "18,867"],
        ...
      ]
    }
  ],
  "timestamp": "2025-10-30T03:14:26.900Z"
}
```

## 🏗 Arquitectura

### Vista general del sistema

El proyecto sigue una arquitectura simple y funcional basada en ES modules:

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   scraper.js │─────>│  Playwright  │─────>│  SEP Website│
│             │      │   (Chromium) │      │             │
└─────────────┘      └──────────────┘      └─────────────┘
       │                                           │
       │                                           │
       v                                           v
┌─────────────┐                           ┌──────────────┐
│  data/*.json│<──────  Extraccion  ──────│ Tablas HTML  │
│             │         y parsing          │              │
└─────────────┘                           └──────────────┘
```

Para mas detalles, consulta los diagramas:

- [Arquitectura del sistema](./system-architecture.mmd)
- [Diagrama de secuencia](./sequence-diagram.mmd)
- [Interfaces principales](./main-interfaces.mmd)

### Funciones principales

- `getStates(page)`: Extrae lista de todos los estados disponibles
- `getMunicipios(page)`: Extrae municipios del estado seleccionado
- `extractTableData(page)`: Parsea tablas HTML y las convierte a arrays
- `scrapeState(page, state, includeAllMunicipios)`: Coordina el scraping de un estado completo

## 📊 Estructura de datos

### Archivo de salida

Cada archivo JSON contiene:

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `state` | string | Nombre del estado en mayusculas |
| `stateCode` | string | Codigo numerico del estado (1-32) |
| `tables` | array | Array de tablas extraidas del sitio |
| `timestamp` | string | Fecha/hora de extraccion (ISO 8601) |

### Estructura de tabla

Cada elemento en `tables` contiene:

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `tableIndex` | number | Indice de la tabla en la pagina |
| `data` | array | Array de arrays representando filas y columnas |

## 🛠 Solucion de problemas

### Error: "Browser not found"

Ejecuta el script de instalacion de navegadores:

```bash
npm run install-browser
```

### Timeouts o errores de red

El sitio del SEP puede ser lento. Los timeouts estan configurados en:
- Carga de municipios: 1000ms
- Extraccion de datos: 2000ms

Puedes ajustarlos en `scraper.js` modificando los valores en `page.waitForTimeout()`.

### Datos incompletos o incorrectos

El sitio usa ASP.NET WebForms con estado. Si encuentras problemas:

1. Verifica que el sitio este disponible en tu navegador
2. Aumenta los tiempos de espera
3. Ejecuta en modo visible (cambia `headless: false` en linea 129)

## 🤝 Contribuir

Las contribuciones son bienvenidas. Si quieres mejorar este proyecto:

1. Haz fork del repositorio
2. Crea una rama para tu feature (`git checkout -b feature/amazing-feature`)
3. Commitea tus cambios (`git commit -m 'Add amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

### Ideas para contribuir

- Agregar validacion de datos extraidos
- Implementar retry logic para mayor robustez
- Exportar datos a formatos adicionales (CSV, Excel)
- Agregar tests automatizados
- Mejorar el parseo de tablas HTML
- Documentar la estructura completa de datos del SEP

## 📄 Licencia

Este proyecto esta bajo la Licencia MIT. Consulta el archivo `LICENSE` para mas detalles.

## 📞 Contacto

Si tienes preguntas o sugerencias, abre un issue en el repositorio.

---

**Nota**: Este proyecto no esta afiliado con la Secretaria de Educacion Publica de Mexico. Es una herramienta independiente para facilitar el acceso a datos publicos.

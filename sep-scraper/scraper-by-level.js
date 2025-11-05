/**
 * Enhanced SEP Scraper - Queries by Education Level
 *
 * This scraper queries the SEP website with specific education level filters
 * to get detailed data (30+ columns) instead of aggregated summary data (6 columns).
 *
 * IMPORTANT: Before running, you MUST discover the correct dropdown values
 * from the website. See INSTRUCTIONS.md for details.
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const BASE_URL = 'https://www.planeacion.sep.gob.mx/principalescifras/';
const OUTPUT_DIR = './data-by-level';
const MAX_CONCURRENT = 2;

// =============================================================================
// CONFIGURATION: Update these values based on what you find on the website
// =============================================================================

// These are educated guesses based on Mexican education system.
// You MUST verify these match the actual dropdown values on the website!
const EDUCATION_LEVELS = [
  // Format: { name: 'Display Name', type: 'dropdown_value', service: 'dropdown_value' }
  // You may need to set values for multiple dropdowns (tipo, nivel, servicio)

  // Option 1: If there's a single dropdown for education level
  { name: 'Secundaria', nivelValue: 'SECUNDARIA' },
  { name: 'Primaria', nivelValue: 'PRIMARIA' },
  { name: 'Preescolar', nivelValue: 'PREESCOLAR' },
  { name: 'Media Superior', nivelValue: 'MEDIA_SUPERIOR' },

  // Option 2: If you need to query specific services within Secundaria
  // { name: 'Telesecundaria', nivelValue: 'SECUNDARIA', servicioValue: 'TELESECUNDARIA' },
  // { name: 'Secundaria General', nivelValue: 'SECUNDARIA', servicioValue: 'GENERAL' },
  // etc.
];

const CONTROL_TYPES = [
  { name: 'Todos', value: '0' },
  { name: 'Público', value: '1' }, // Verify actual value!
  { name: 'Privado', value: '2' },  // Verify actual value!
];

// Dropdown element names - verify these match the website!
const DROPDOWN_NAMES = {
  state: 'DDLEntidad',
  municipality: 'DDLMunicipio',
  nivel: 'DDLNivelEducativo',      // Education level
  tipo: 'DDLTipoEducativo',         // Education type
  servicio: 'DDLServicioEducativo', // Education service
  control: 'DDLSostenimiento',      // Public/Private
  submitButton: 'Button1'
};

// =============================================================================

mkdirSync(OUTPUT_DIR, { recursive: true });

async function getStates(page) {
  return await page.evaluate((dropdown) => {
    const select = document.querySelector(`select[name="${dropdown}"]`);
    const options = Array.from(select.options);
    return options
      .filter(opt => opt.value !== '0' && opt.value !== 'Todas')
      .map(opt => ({ value: opt.value, name: opt.text }));
  }, DROPDOWN_NAMES.state);
}

async function getMunicipios(page) {
  return await page.evaluate((dropdown) => {
    const select = document.querySelector(`select[name="${dropdown}"]`);
    const options = Array.from(select.options);
    return options
      .filter(opt => opt.value !== '0' && opt.value !== 'Todos')
      .map(opt => ({ value: opt.value, name: opt.text }));
  }, DROPDOWN_NAMES.municipality);
}

async function extractTableData(page) {
  await page.waitForTimeout(2000);

  return await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    const result = [];

    tables.forEach((table, idx) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      const tableData = rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        return cells.map(cell => cell.textContent.trim());
      });

      if (tableData.length > 0) {
        // Count non-empty columns in first data row
        const columnCount = tableData[0]?.length || 0;

        result.push({
          tableIndex: idx,
          data: tableData,
          rowCount: tableData.length,
          columnCount: columnCount
        });
      }
    });

    return result;
  });
}

async function queryWithFilters(page, state, municipio, educationLevel, controlType) {
  // Navigate to fresh page
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Select state
  await page.selectOption(`select[name="${DROPDOWN_NAMES.state}"]`, state.value);
  await page.waitForTimeout(1000);

  // Select municipality
  await page.selectOption(`select[name="${DROPDOWN_NAMES.municipality}"]`, municipio.value);
  await page.waitForTimeout(500);

  // Set education level filter (try multiple dropdown names)
  if (educationLevel.nivelValue) {
    try {
      await page.selectOption(`select[name="${DROPDOWN_NAMES.nivel}"]`, educationLevel.nivelValue);
      await page.waitForTimeout(500);
    } catch (error) {
      console.log(`      ⚠️  Could not set nivel: ${error.message}`);
    }
  }

  if (educationLevel.tipoValue) {
    try {
      await page.selectOption(`select[name="${DROPDOWN_NAMES.tipo}"]`, educationLevel.tipoValue);
      await page.waitForTimeout(500);
    } catch (error) {
      console.log(`      ⚠️  Could not set tipo: ${error.message}`);
    }
  }

  if (educationLevel.servicioValue) {
    try {
      await page.selectOption(`select[name="${DROPDOWN_NAMES.servicio}"]`, educationLevel.servicioValue);
      await page.waitForTimeout(500);
    } catch (error) {
      console.log(`      ⚠️  Could not set servicio: ${error.message}`);
    }
  }

  // Set control type (public/private)
  if (controlType.value !== '0') {
    try {
      await page.selectOption(`select[name="${DROPDOWN_NAMES.control}"]`, controlType.value);
      await page.waitForTimeout(500);
    } catch (error) {
      console.log(`      ⚠️  Could not set control: ${error.message}`);
    }
  }

  // Submit form
  await page.click(`input[name="${DROPDOWN_NAMES.submitButton}"]`);

  // Extract data
  const tables = await extractTableData(page);

  return {
    state: state.name,
    stateCode: state.value,
    municipality: municipio.name,
    municipalityCode: municipio.value,
    educationLevel: educationLevel.name,
    controlType: controlType.name,
    tables: tables,
    timestamp: new Date().toISOString()
  };
}

async function scrapeState(page, state, stateIndex, totalStates) {
  console.log(`\n📍 [${stateIndex}/${totalStates}] Scraping: ${state.name}`);

  const stateDir = `${OUTPUT_DIR}/${state.name.toLowerCase().replace(/\s+/g, '_')}`;
  mkdirSync(stateDir, { recursive: true });

  // Navigate and get municipalities
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.selectOption(`select[name="${DROPDOWN_NAMES.state}"]`, state.value);
  await page.waitForTimeout(1000);

  const municipios = await getMunicipios(page);
  console.log(`   Found ${municipios.length} municipalities`);

  // Save metadata
  writeFileSync(`${stateDir}/meta.json`, JSON.stringify({
    state: state.name,
    stateCode: state.value,
    totalMunicipalities: municipios.length,
    educationLevels: EDUCATION_LEVELS,
    controlTypes: CONTROL_TYPES,
    timestamp: new Date().toISOString()
  }, null, 2));

  let totalQueries = 0;

  // Scrape each municipality with all filter combinations
  for (let i = 0; i < municipios.length; i++) {
    const municipio = municipios[i];
    console.log(`   [${i + 1}/${municipios.length}] ${municipio.name}`);

    // Query each education level
    for (const eduLevel of EDUCATION_LEVELS) {
      // Query each control type
      for (const control of CONTROL_TYPES) {
        const data = await queryWithFilters(page, state, municipio, eduLevel, control);
        totalQueries++;

        // Save results
        const levelSlug = eduLevel.name.toLowerCase().replace(/\s+/g, '_');
        const controlSlug = control.name.toLowerCase().replace(/\s+/g, '_');
        const filename = `${stateDir}/muni_${municipio.value}_${levelSlug}_${controlSlug}.json`;
        writeFileSync(filename, JSON.stringify(data, null, 2));

        // Log if we got detailed data (more than 6 columns)
        const mainTable = data.tables.find(t => t.columnCount > 6);
        if (mainTable) {
          console.log(`      ✅ ${eduLevel.name} ${control.name}: ${mainTable.columnCount} columns, ${mainTable.rowCount} rows`);
        }

        await page.waitForTimeout(500); // Be nice to the server
      }
    }
  }

  console.log(`   ✅ Completed with ${totalQueries} queries`);
  return { state: state.name, queries: totalQueries };
}

async function main() {
  console.log('🚀 SEP Scraper - By Education Level\n');
  console.log('⚠️  IMPORTANT: Make sure you\'ve configured the correct dropdown values!');
  console.log('   See EDUCATION_LEVELS and DROPDOWN_NAMES at the top of this file.\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const states = await getStates(page);

    // TEST MODE: Uncomment to test with just one state
    // const states = [states[0]];

    console.log(`Found ${states.length} states to scrape\n`);

    const startTime = Date.now();

    for (let i = 0; i < states.length; i++) {
      await scrapeState(page, states[i], i + 1, states.length);
    }

    const totalTime = ((Date.now() - startTime) / 60000).toFixed(1);

    console.log('\n' + '='.repeat(50));
    console.log('✨ Scraping complete!');
    console.log(`⏱️  Total time: ${totalTime} minutes`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

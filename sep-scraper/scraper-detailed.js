import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';

const BASE_URL = 'https://www.planeacion.sep.gob.mx/principalescifras/';
const OUTPUT_DIR = './data-detailed';
const MAX_CONCURRENT_STATES = 2; // Reduced for detailed scraping
const TEST_MODE = process.env.TEST_MODE === 'true';
const TEST_STATE_LIMIT = 1; // Test with one state first

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true });

// Known Mexican education levels (fallback if auto-discovery fails)
const KNOWN_EDUCATION_LEVELS = [
  { name: 'Preescolar', expectedGrades: 3 },
  { name: 'Primaria', expectedGrades: 6 },
  { name: 'Secundaria', expectedGrades: 3 },
  { name: 'Media Superior', expectedGrades: 3 }
];

const CONTROL_TYPES = [
  { name: 'Todos', value: '0' },
  { name: 'Público', value: 'PUBLIC' },  // Will discover actual value
  { name: 'Privado', value: 'PRIVATE' }  // Will discover actual value
];

async function getStates(page) {
  const states = await page.evaluate(() => {
    const select = document.querySelector('select[name="DDLEntidad"]');
    const options = Array.from(select.options);
    return options
      .filter(opt => opt.value !== '0' && opt.value !== 'Todas')
      .map(opt => ({ value: opt.value, name: opt.text }));
  });
  return states;
}

async function getMunicipios(page) {
  const municipios = await page.evaluate(() => {
    const select = document.querySelector('select[name="DDLMunicipio"]');
    const options = Array.from(select.options);
    return options
      .filter(opt => opt.value !== '0' && opt.value !== 'Todos')
      .map(opt => ({ value: opt.value, name: opt.text }));
  });
  return municipios;
}

// Discover available education levels from the form
async function discoverEducationLevels(page) {
  console.log('🔍 Attempting to discover education levels...');

  try {
    // Try different dropdown names that might contain education levels
    const dropdownNames = [
      'DDLNivelEducativo',
      'DDLTipoEducativo',
      'DDLServicioEducativo',
      'DDLNivel',
      'DDLTipo'
    ];

    for (const dropdownName of dropdownNames) {
      const options = await page.evaluate((name) => {
        const select = document.querySelector(`select[name="${name}"]`);
        if (!select) return null;
        const options = Array.from(select.options);
        return options
          .filter(opt => opt.value !== '0' && opt.value !== 'Todos' && opt.value !== '')
          .map(opt => ({ value: opt.value, text: opt.text.trim(), dropdownName: name }));
      }, dropdownName);

      if (options && options.length > 0) {
        console.log(`✅ Found ${options.length} education levels in dropdown: ${dropdownName}`);
        console.log('  Options:', options.map(o => o.text).join(', '));
        return { dropdownName, options };
      }
    }

    console.log('⚠️  Could not auto-discover education levels, will try querying with default filters');
    return null;
  } catch (error) {
    console.log('⚠️  Error discovering education levels:', error.message);
    return null;
  }
}

// Discover control types (Público/Privado)
async function discoverControlTypes(page) {
  try {
    const dropdownNames = ['DDLSostenimiento', 'DDLControl'];

    for (const dropdownName of dropdownNames) {
      const options = await page.evaluate((name) => {
        const select = document.querySelector(`select[name="${name}"]`);
        if (!select) return null;
        const options = Array.from(select.options);
        return options.map(opt => ({
          value: opt.value,
          text: opt.text.trim(),
          dropdownName: name
        }));
      }, dropdownName);

      if (options && options.length > 1) {
        console.log(`✅ Found control types in dropdown: ${dropdownName}`);
        console.log('  Options:', options.map(o => o.text).join(', '));
        return { dropdownName, options };
      }
    }
  } catch (error) {
    console.log('⚠️  Error discovering control types:', error.message);
  }
  return null;
}

async function extractTableData(page) {
  await page.waitForTimeout(2000);

  const data = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    const result = [];

    tables.forEach((table, idx) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      const tableData = rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        return cells.map(cell => cell.textContent.trim());
      });

      if (tableData.length > 0) {
        result.push({
          tableIndex: idx,
          data: tableData,
          columnCount: tableData[0]?.length || 0
        });
      }
    });

    return result;
  });

  return data;
}

async function scrapeStateDetailed(page, state, stateIndex = 0, totalStates = 0) {
  console.log(`\n📍 [${stateIndex}/${totalStates}] Scraping state: ${state.name} (${state.value})`);

  // Create state directory
  const stateDir = `${OUTPUT_DIR}/${state.name.toLowerCase().replace(/\s+/g, '_')}`;
  mkdirSync(stateDir, { recursive: true });

  // Navigate to main page
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Select state
  await page.selectOption('select[name="DDLEntidad"]', state.value);
  await page.waitForTimeout(1000);

  // Discover available options
  const educationLevels = await discoverEducationLevels(page);
  const controlTypes = await discoverControlTypes(page);

  // Get all municipalities for this state
  const municipios = await getMunicipios(page);
  console.log(`   Found ${municipios.length} municipalities`);

  // Write state metadata
  const meta = {
    state: state.name,
    stateCode: state.value,
    totalMunicipalities: municipios.length,
    educationLevels: educationLevels?.options || [],
    controlTypes: controlTypes?.options || [],
    timestamp: new Date().toISOString()
  };
  writeFileSync(`${stateDir}/meta.json`, JSON.stringify(meta, null, 2));

  let totalQueries = 0;

  // Scrape each municipality
  for (let i = 0; i < municipios.length; i++) {
    const municipio = municipios[i];
    console.log(`   [${i + 1}/${municipios.length}] ${municipio.name}`);

    // Query 1: Default (Todos) - this gives us the current 6-column data
    const defaultData = await scrapeMunicipalityQuery(
      page,
      state,
      municipio,
      { level: 'Todos', control: 'Todos' }
    );
    totalQueries++;

    // Save default query
    const filename = `${stateDir}/municipality_${municipio.value.padStart(3, '0')}_default.json`;
    writeFileSync(filename, JSON.stringify(defaultData, null, 2));

    // If we discovered education levels, query each one
    if (educationLevels && educationLevels.options.length > 0) {
      for (const eduLevel of educationLevels.options) {
        // Query each control type for this education level
        const controlOptions = controlTypes?.options || [{ value: '0', text: 'Todos' }];

        for (const control of controlOptions) {
          const detailedData = await scrapeMunicipalityQuery(
            page,
            state,
            municipio,
            {
              level: eduLevel.text,
              levelValue: eduLevel.value,
              levelDropdown: educationLevels.dropdownName,
              control: control.text,
              controlValue: control.value,
              controlDropdown: controlTypes?.dropdownName
            }
          );
          totalQueries++;

          // Save detailed query
          const levelSlug = eduLevel.text.toLowerCase().replace(/\s+/g, '_');
          const controlSlug = control.text.toLowerCase().replace(/\s+/g, '_');
          const detailedFilename = `${stateDir}/municipality_${municipio.value.padStart(3, '0')}_${levelSlug}_${controlSlug}.json`;
          writeFileSync(detailedFilename, JSON.stringify(detailedData, null, 2));

          // Brief pause between queries
          await page.waitForTimeout(500);
        }
      }
    }
  }

  console.log(`   ✅ Completed ${municipios.length} municipalities with ${totalQueries} total queries`);
  return { state: state.name, municipalitiesScraped: municipios.length, totalQueries };
}

async function scrapeMunicipalityQuery(page, state, municipio, filters) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.selectOption('select[name="DDLEntidad"]', state.value);
  await page.waitForTimeout(500);
  await page.selectOption('select[name="DDLMunicipio"]', municipio.value);
  await page.waitForTimeout(500);

  // Set education level filter if specified
  if (filters.levelDropdown && filters.levelValue) {
    try {
      await page.selectOption(`select[name="${filters.levelDropdown}"]`, filters.levelValue);
      await page.waitForTimeout(500);
    } catch (error) {
      console.log(`      ⚠️  Could not set education level filter: ${error.message}`);
    }
  }

  // Set control type filter if specified
  if (filters.controlDropdown && filters.controlValue && filters.controlValue !== '0') {
    try {
      await page.selectOption(`select[name="${filters.controlDropdown}"]`, filters.controlValue);
      await page.waitForTimeout(500);
    } catch (error) {
      console.log(`      ⚠️  Could not set control type filter: ${error.message}`);
    }
  }

  // Submit form
  await page.click('input[name="Button1"]');

  // Extract data
  const tableData = await extractTableData(page);

  return {
    municipality: municipio.name,
    municipalityCode: municipio.value,
    state: state.name,
    stateCode: state.value,
    filters: filters,
    tables: tableData,
    timestamp: new Date().toISOString()
  };
}

async function scrapeStateWorker(state, stateIndex, totalStates, progressTracker) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  try {
    const startTime = Date.now();
    const result = await scrapeStateDetailed(page, state, stateIndex, totalStates);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    progressTracker.completed++;
    const avgTime = (Date.now() - progressTracker.startTime) / progressTracker.completed;
    const remaining = totalStates - progressTracker.completed;
    const eta = (avgTime * remaining / 60000).toFixed(1);

    console.log(`✅ Completed ${state.name} in ${duration}s | Progress: ${progressTracker.completed}/${totalStates} | ETA: ${eta} min`);
    return result;
  } catch (error) {
    console.error(`❌ Error scraping ${state.name}:`, error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

async function runWithConcurrency(tasks, maxConcurrent) {
  const results = [];
  const executing = [];

  for (const task of tasks) {
    const promise = task().then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });

    results.push(promise);
    executing.push(promise);

    if (executing.length >= maxConcurrent) {
      await Promise.race(executing);
    }
  }

  return Promise.allSettled(results);
}

async function main() {
  console.log('🚀 Starting SEP Detailed Scraper\n');
  console.log(`⚙️  Max concurrent states: ${MAX_CONCURRENT_STATES}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    let states = await getStates(page);
    await browser.close();

    if (TEST_MODE) {
      states = states.slice(0, TEST_STATE_LIMIT);
      console.log(`🧪 TEST MODE: Limited to ${states.length} state(s)\n`);
    }

    console.log(`Found ${states.length} states to scrape\n`);

    const progressTracker = {
      completed: 0,
      startTime: Date.now()
    };

    const tasks = states.map((state, index) =>
      () => scrapeStateWorker(state, index + 1, states.length, progressTracker)
    );

    const results = await runWithConcurrency(tasks, MAX_CONCURRENT_STATES);

    const totalTime = ((Date.now() - progressTracker.startTime) / 60000).toFixed(1);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log('\n' + '='.repeat(50));
    console.log('✨ Scraping complete!');
    console.log(`⏱️  Total time: ${totalTime} minutes`);
    console.log(`✅ Successful: ${successful}/${states.length}`);
    if (failed > 0) {
      console.log(`❌ Failed: ${failed}`);
    }
    console.log('='.repeat(50) + '\n');

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    throw error;
  }
}

main().catch(console.error);

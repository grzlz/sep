import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const BASE_URL = 'https://www.planeacion.sep.gob.mx/principalescifras/';
const OUTPUT_DIR = './data';
const MAX_CONCURRENT_STATES = 3; // Parallel workers
const TEST_MODE = process.env.TEST_MODE === 'true'; // Set TEST_MODE=true for testing
const TEST_STATE_LIMIT = 2; // Only scrape first N states in test mode

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true });

async function getStates(page) {
  const states = await page.evaluate(() => {
    const select = document.querySelector('select[name="DDLEntidad"]');
    const options = Array.from(select.options);
    return options
      .filter(opt => opt.value !== '0')
      .map(opt => ({ value: opt.value, name: opt.text }));
  });
  return states;
}

async function getMunicipios(page) {
  const municipios = await page.evaluate(() => {
    const select = document.querySelector('select[name="DDLMunicipio"]');
    const options = Array.from(select.options);
    return options
      .filter(opt => opt.value !== '0')
      .map(opt => ({ value: opt.value, name: opt.text }));
  });
  return municipios;
}

async function extractTableData(page) {
  // Wait for results to load
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
          data: tableData
        });
      }
    });

    return result;
  });

  return data;
}

async function scrapeState(page, state, stateIndex = 0, totalStates = 0) {
  console.log(`\n📍 [${stateIndex}/${totalStates}] Scraping state: ${state.name} (${state.value})`);

  // Create state directory
  const stateDir = `${OUTPUT_DIR}/${state.name.toLowerCase().replace(/\s+/g, '_')}`;
  mkdirSync(stateDir, { recursive: true });

  // Navigate to main page
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Select state
  await page.selectOption('select[name="DDLEntidad"]', state.value);

  // Wait for municipalities to load
  await page.waitForTimeout(1000);

  // Get all municipalities for this state
  const municipios = await getMunicipios(page);
  console.log(`   Found ${municipios.length} municipalities`);

  // Write state metadata immediately
  const meta = {
    state: state.name,
    stateCode: state.value,
    totalMunicipalities: municipios.length,
    timestamp: new Date().toISOString()
  };
  writeFileSync(`${stateDir}/meta.json`, JSON.stringify(meta, null, 2));

  // Scrape and write each municipality immediately (streaming)
  for (let i = 0; i < municipios.length; i++) {
    const municipio = municipios[i];
    console.log(`   [${i + 1}/${municipios.length}] ${municipio.name}`);

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.selectOption('select[name="DDLEntidad"]', state.value);
    await page.waitForTimeout(500);
    await page.selectOption('select[name="DDLMunicipio"]', municipio.value);
    await page.waitForTimeout(500);

    // Submit form
    await page.click('input[name="Button1"]');

    // Extract data
    const tableData = await extractTableData(page);

    // Write municipality data immediately (no accumulation)
    const municipalityData = {
      municipality: municipio.name,
      municipalityCode: municipio.value,
      state: state.name,
      stateCode: state.value,
      tables: tableData,
      timestamp: new Date().toISOString()
    };

    const filename = `${stateDir}/municipality_${municipio.value.padStart(3, '0')}.json`;
    writeFileSync(filename, JSON.stringify(municipalityData, null, 2));
  }

  return { state: state.name, municipalitiesScraped: municipios.length };
}

// Concurrency control: run tasks with max parallel limit
async function runWithConcurrency(tasks, maxConcurrent, progressTracker) {
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

async function scrapeStateWorker(state, stateIndex, totalStates, progressTracker) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  try {
    const startTime = Date.now();
    const result = await scrapeState(page, state, stateIndex, totalStates);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Update progress
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

async function main() {
  console.log('🚀 Starting SEP Scraper (Parallel Mode)\n');
  console.log(`⚙️  Max concurrent states: ${MAX_CONCURRENT_STATES}\n`);

  // Use temporary browser just to get states list
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    let states = await getStates(page);
    await browser.close();

    // Test mode: only scrape first N states
    if (TEST_MODE) {
      states = states.slice(0, TEST_STATE_LIMIT);
      console.log(`🧪 TEST MODE: Limited to ${states.length} states\n`);
    }

    console.log(`Found ${states.length} states to scrape\n`);
    console.log('Starting parallel scraping...\n');

    const progressTracker = {
      completed: 0,
      startTime: Date.now()
    };

    // Create worker tasks for each state
    const tasks = states.map((state, index) =>
      () => scrapeStateWorker(state, index + 1, states.length, progressTracker)
    );

    // Run with concurrency control
    const results = await runWithConcurrency(tasks, MAX_CONCURRENT_STATES, progressTracker);

    // Summary
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

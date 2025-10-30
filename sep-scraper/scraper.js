import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const BASE_URL = 'https://www.planeacion.sep.gob.mx/principalescifras/';
const OUTPUT_DIR = './data';

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

async function scrapeState(page, state, includeAllMunicipios = false) {
  console.log(`\n📍 Scraping state: ${state.name} (${state.value})`);

  // Navigate to main page
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Select state
  await page.selectOption('select[name="DDLEntidad"]', state.value);

  // Wait for municipalities to load
  await page.waitForTimeout(1000);

  if (includeAllMunicipios) {
    // Get all municipalities for this state
    const municipios = await getMunicipios(page);
    console.log(`   Found ${municipios.length} municipalities`);

    const stateData = {
      state: state.name,
      stateCode: state.value,
      allMunicipalities: [],
      timestamp: new Date().toISOString()
    };

    // Scrape each municipality
    for (const municipio of municipios) {
      console.log(`   📍 Scraping: ${municipio.name}`);

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.selectOption('select[name="DDLEntidad"]', state.value);
      await page.waitForTimeout(500);
      await page.selectOption('select[name="DDLMunicipio"]', municipio.value);
      await page.waitForTimeout(500);

      // Submit form
      await page.click('input[name="Button1"]');

      // Extract data
      const tableData = await extractTableData(page);

      stateData.allMunicipalities.push({
        municipality: municipio.name,
        municipalityCode: municipio.value,
        tables: tableData
      });
    }

    return stateData;
  } else {
    // Just scrape state-level data (all municipalities)
    await page.selectOption('select[name="DDLMunicipio"]', '0'); // All
    await page.click('input[name="Button1"]');

    const tableData = await extractTableData(page);

    return {
      state: state.name,
      stateCode: state.value,
      tables: tableData,
      timestamp: new Date().toISOString()
    };
  }
}

async function main() {
  console.log('🚀 Starting SEP Scraper\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  try {
    // Get all states
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const states = await getStates(page);
    console.log(`Found ${states.length} states\n`);

    // Test with first state only
    const testState = states[0]; // Aguascalientes
    const data = await scrapeState(page, testState, false);

    // Save to file
    const filename = `${OUTPUT_DIR}/${testState.name.toLowerCase().replace(/\s+/g, '_')}.json`;
    writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`\n✅ Data saved to: ${filename}`);

    console.log('\n💡 To scrape all states, uncomment the loop in main()');

    // Uncomment below to scrape ALL states
    /*
    for (const state of states) {
      const data = await scrapeState(page, state, false);
      const filename = `${OUTPUT_DIR}/${state.name.toLowerCase().replace(/\s+/g, '_')}.json`;
      writeFileSync(filename, JSON.stringify(data, null, 2));
      console.log(`✅ Saved: ${filename}`);
    }
    */

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await browser.close();
  }

  console.log('\n✨ Scraping complete!');
}

main().catch(console.error);

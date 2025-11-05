import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE_URL = 'https://www.planeacion.sep.gob.mx/principalescifras/';

async function testEducationLevel() {
  console.log('🔍 Testing different education level queries\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Loading page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    console.log('✅ Page loaded\n');

    // Select Aguascalientes
    console.log('Selecting AGUASCALIENTES state...');
    await page.selectOption('select[name="DDLEntidad"]', '1');
    await page.waitForTimeout(1000);

    // Select Aguascalientes municipality
    console.log('Selecting AGUASCALIENTES municipality...');
    await page.selectOption('select[name="DDLMunicipio"]', '001');
    await page.waitForTimeout(500);

    // Get available options for all dropdowns
    const formOptions = await page.evaluate(() => {
      const result = {};

      // Get all select elements
      const selects = document.querySelectorAll('select');
      selects.forEach(select => {
        const name = select.name;
        const options = Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.text.trim()
        }));
        result[name] = options;
      });

      return result;
    });

    console.log('\n📋 Available form options:');
    console.log(JSON.stringify(formOptions, null, 2));

    // Test 1: Default query (Todos)
    console.log('\n\n🧪 Test 1: Default query (Todos)');
    await page.click('input[name="Button1"]');
    await page.waitForTimeout(3000);

    const defaultData = await extractTableInfo(page);
    console.log('Result:', JSON.stringify(defaultData, null, 2));

    // Save the form options to a file
    writeFileSync('./form-options.json', JSON.stringify(formOptions, null, 2));
    console.log('\n✅ Form options saved to form-options.json');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

async function extractTableInfo(page) {
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    const result = {
      tableCount: tables.length,
      tables: []
    };

    tables.forEach((table, idx) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) return;

      // Get headers (first row with th or td elements)
      const headerRow = rows[0];
      const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
      const headers = headerCells.map(cell => cell.textContent.trim());

      // Count columns
      const columnCount = headers.length;

      // Get a sample data row
      let sampleRow = [];
      if (rows.length > 1) {
        const dataCells = Array.from(rows[1].querySelectorAll('td, th'));
        sampleRow = dataCells.map(cell => cell.textContent.trim());
      }

      result.tables.push({
        index: idx,
        rowCount: rows.length,
        columnCount: columnCount,
        headers: headers.slice(0, 10), // First 10 headers
        sampleRow: sampleRow.slice(0, 10) // First 10 cells
      });
    });

    return result;
  });

  return info;
}

testEducationLevel().catch(console.error);

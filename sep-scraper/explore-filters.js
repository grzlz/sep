import { chromium } from 'playwright';

const BASE_URL = 'https://www.planeacion.sep.gob.mx/principalescifras/';

async function exploreFilters() {
  console.log('🔍 Exploring available filters on SEP website\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    console.log('✅ Page loaded\n');

    // Get all form elements and their options
    console.log('📋 Available filters:\n');

    // 1. Modalidad
    const modalidadOptions = await page.evaluate(() => {
      const select = document.querySelector('select[name="DDLModalidad"]');
      if (!select) return null;
      const options = Array.from(select.options);
      return options.map(opt => ({ value: opt.value, text: opt.text }));
    });
    console.log('1. Modalidad:', modalidadOptions);

    // 2. Tipo educativo
    const tipoOptions = await page.evaluate(() => {
      const select = document.querySelector('select[name="DDLTipoEducativo"]');
      if (!select) return null;
      const options = Array.from(select.options);
      return options.map(opt => ({ value: opt.value, text: opt.text }));
    });
    console.log('2. Tipo Educativo:', tipoOptions);

    // 3. Nivel educativo
    const nivelOptions = await page.evaluate(() => {
      const select = document.querySelector('select[name="DDLNivelEducativo"]');
      if (!select) return null;
      const options = Array.from(select.options);
      return options.map(opt => ({ value: opt.value, text: opt.text }));
    });
    console.log('3. Nivel Educativo:', nivelOptions);

    // 4. Servicio educativo
    const servicioOptions = await page.evaluate(() => {
      const select = document.querySelector('select[name="DDLServicioEducativo"]');
      if (!select) return null;
      const options = Array.from(select.options);
      return options.map(opt => ({ value: opt.value, text: opt.text }));
    });
    console.log('4. Servicio Educativo:', servicioOptions);

    // 5. Sostenimiento (Control)
    const sostenimientoOptions = await page.evaluate(() => {
      const select = document.querySelector('select[name="DDLSostenimiento"]');
      if (!select) return null;
      const options = Array.from(select.options);
      return options.map(opt => ({ value: opt.value, text: opt.text }));
    });
    console.log('5. Sostenimiento:', sostenimientoOptions);

    // Select Aguascalientes to enable municipality dropdown
    console.log('\n📍 Selecting Aguascalientes...');
    await page.selectOption('select[name="DDLEntidad"]', '1');
    await page.waitForTimeout(1000);

    // Try selecting a specific education level to see if more options appear
    console.log('\n🧪 Testing with different filters...\n');

    // Test 1: Select Modalidad = Escolarizada
    if (modalidadOptions && modalidadOptions.length > 1) {
      console.log('Test 1: Selecting Modalidad = Escolarizada');
      await page.selectOption('select[name="DDLModalidad"]', modalidadOptions[1].value);
      await page.waitForTimeout(1000);

      const updatedTipoOptions = await page.evaluate(() => {
        const select = document.querySelector('select[name="DDLTipoEducativo"]');
        if (!select) return null;
        const options = Array.from(select.options);
        return options.map(opt => ({ value: opt.value, text: opt.text }));
      });
      console.log('  Updated Tipo Educativo:', updatedTipoOptions);
    }

    // Let's try to see what the table looks like with different combinations
    console.log('\n📊 Testing different filter combinations:\n');

    // Select Aguascalientes municipality
    await page.selectOption('select[name="DDLMunicipio"]', '001');
    await page.waitForTimeout(500);

    // Submit with default filters (Todos)
    console.log('Test: Default filters (Todos)');
    await page.click('input[name="Button1"]');
    await page.waitForTimeout(2000);

    // Extract table headers to see what columns we get
    const headers = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const result = [];
      tables.forEach((table, idx) => {
        const headerRow = table.querySelector('tr');
        if (headerRow) {
          const cells = Array.from(headerRow.querySelectorAll('th, td'));
          const headerText = cells.map(cell => cell.textContent.trim());
          result.push({
            tableIndex: idx,
            headers: headerText
          });
        }
      });
      return result;
    });

    console.log('Table headers with default filters:');
    headers.forEach(h => {
      if (h.headers.length > 1) {
        console.log(`  Table ${h.tableIndex}:`, h.headers);
      }
    });

    console.log('\n✅ Exploration complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

exploreFilters().catch(console.error);

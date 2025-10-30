import { readFileSync, writeFileSync } from 'fs';

const INPUT_FILE = './data/baja_california_sur.json';
const OUTPUT_FILE = './test-output.csv';

// Helper: Escape CSV values (handle commas, quotes)
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Helper: Clean number strings (remove commas from "1,522" → "1522")
function cleanNumber(str) {
  if (!str) return '';
  return String(str).replace(/,/g, '');
}

// Helper: Parse table data into rows
function parseTableData(tableData) {
  const rows = [];

  // Find which sub-array has the clean data
  let flatData = null;

  for (const item of tableData) {
    if (Array.isArray(item) && item.length > 6) {
      flatData = item;
      break;
    }
  }

  if (!flatData) return rows;

  // Skip header rows
  let dataStartIndex = 0;
  for (let i = 0; i < flatData.length; i++) {
    if (flatData[i] === 'Localidad' || flatData[i].includes('Localidad')) {
      dataStartIndex = i + 6;
      break;
    }
  }

  // Parse every 6 elements as one row
  for (let i = dataStartIndex; i < flatData.length; i += 6) {
    const locality = flatData[i];
    const schools = flatData[i + 1];
    const students = flatData[i + 2];
    const studentsFemale = flatData[i + 3];
    const studentsMale = flatData[i + 4];
    const teachers = flatData[i + 5];

    // Stop at TOTAL row or footnotes
    if (!locality ||
        locality.includes('TOTAL') ||
        locality.includes('¹') ||
        locality.includes('Fuente:')) {
      break;
    }

    rows.push({
      locality: locality.trim(),
      schools: cleanNumber(schools),
      students: cleanNumber(students),
      studentsFemale: cleanNumber(studentsFemale),
      studentsMale: cleanNumber(studentsMale),
      teachers: cleanNumber(teachers)
    });
  }

  return rows;
}

function testConversion() {
  console.log('🔄 Testing CSV conversion on Baja California Sur...\n');

  // CSV Header
  const header = [
    'State',
    'StateCode',
    'Municipality',
    'MunicipalityCode',
    'Locality',
    'Schools',
    'Students',
    'StudentsFemale',
    'StudentsMale',
    'Teachers'
  ];

  const csvRows = [header.join(',')];
  let totalRows = 0;

  // Read the file
  const content = readFileSync(INPUT_FILE, 'utf8');
  const data = JSON.parse(content);

  const state = data.state;
  const stateCode = data.stateCode;

  console.log(`State: ${state}`);
  console.log(`Municipalities: ${data.allMunicipalities?.length || 0}\n`);

  // Process each municipality
  if (data.allMunicipalities) {
    for (const muni of data.allMunicipalities) {
      const municipality = muni.municipality;
      const municipalityCode = muni.municipalityCode;

      console.log(`Processing: ${municipality}`);

      // Find the table with locality data
      let localityTable = null;
      for (const table of muni.tables) {
        const tableStr = JSON.stringify(table.data).substring(0, 500);
        if (tableStr.includes('Localidad') || tableStr.includes('LOCALIDAD')) {
          localityTable = table;
          break;
        }
      }

      if (localityTable) {
        const rows = parseTableData(localityTable.data);
        console.log(`  Found ${rows.length} localities`);

        for (const row of rows) {
          const csvRow = [
            escapeCSV(state),
            escapeCSV(stateCode),
            escapeCSV(municipality),
            escapeCSV(municipalityCode),
            escapeCSV(row.locality),
            escapeCSV(row.schools),
            escapeCSV(row.students),
            escapeCSV(row.studentsFemale),
            escapeCSV(row.studentsMale),
            escapeCSV(row.teachers)
          ];

          csvRows.push(csvRow.join(','));
          totalRows++;
        }
      } else {
        console.log(`  ⚠️  No locality table found`);
      }
    }
  }

  // Write to file
  writeFileSync(OUTPUT_FILE, csvRows.join('\n'), 'utf8');

  console.log(`\n✅ CSV created: ${OUTPUT_FILE}`);
  console.log(`📊 Total rows: ${totalRows} (+ 1 header)`);
  console.log(`\nFirst few lines:`);
  console.log(csvRows.slice(0, 5).join('\n'));
}

testConversion();

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_DIR = './data';
const OUTPUT_FILE = './output.csv';

// Helper: Escape CSV values (handle commas, quotes)
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // If contains comma, quote, or newline → wrap in quotes and escape quotes
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

  // tableData is an array of arrays
  // Each sub-array with length 6 is potentially a data row
  for (const arr of tableData) {
    // Only process arrays with exactly 6 elements
    if (!Array.isArray(arr) || arr.length !== 6) {
      continue;
    }

    const locality = arr[0];
    const schools = arr[1];
    const students = arr[2];
    const studentsFemale = arr[3];
    const studentsMale = arr[4];
    const teachers = arr[5];

    // Skip header row and totals/footnotes
    if (!locality ||
        locality === 'Localidad' ||
        locality.includes('Localidad') ||
        locality.includes('TOTAL') ||
        locality.includes('¹') ||
        locality.includes('Fuente:')) {
      continue;
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

function jsonToCSV() {
  console.log('🔄 Converting JSON to CSV...\n');

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

  // Read all JSON files (or just test with one)
  // const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const files = ['baja_california_sur.json']; // TEST: Just one file
  console.log(`Processing ${files.length} JSON file(s)\n`);

  for (const file of files) {
    console.log(`Processing: ${file}`);
    const filePath = join(DATA_DIR, file);
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    const state = data.state;
    const stateCode = data.stateCode;

    // Process each municipality
    if (data.allMunicipalities) {
      for (const muni of data.allMunicipalities) {
        const municipality = muni.municipality;
        const municipalityCode = muni.municipalityCode;

        // Find the table with locality data (usually index 1)
        let localityTable = null;
        for (const table of muni.tables) {
          // Check if this table has locality data
          const tableStr = JSON.stringify(table.data).substring(0, 500);
          if (tableStr.includes('Localidad') || tableStr.includes('LOCALIDAD')) {
            localityTable = table;
            break;
          }
        }

        if (localityTable) {
          const rows = parseTableData(localityTable.data);

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
        }
      }
    }

    console.log(`  ✓ Processed ${data.allMunicipalities?.length || 0} municipalities`);
  }

  // Write to file
  writeFileSync(OUTPUT_FILE, csvRows.join('\n'), 'utf8');

  console.log(`\n✅ CSV created: ${OUTPUT_FILE}`);
  console.log(`📊 Total rows: ${totalRows} (+ 1 header)`);
}

jsonToCSV();

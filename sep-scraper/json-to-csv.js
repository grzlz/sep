import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
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
  let totalMunicipalities = 0;

  // Read all state directories
  const stateDirs = readdirSync(DATA_DIR).filter(name => {
    const fullPath = join(DATA_DIR, name);
    return statSync(fullPath).isDirectory();
  });

  console.log(`Processing ${stateDirs.length} state(s)\n`);

  for (const stateDir of stateDirs) {
    console.log(`Processing: ${stateDir}`);
    const statePath = join(DATA_DIR, stateDir);

    // Read meta.json to get state info
    const metaPath = join(statePath, 'meta.json');
    let state = stateDir;
    let stateCode = '';

    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      state = meta.state;
      stateCode = meta.stateCode;
    } catch (err) {
      console.log(`  ⚠️  Could not read meta.json, using directory name`);
    }

    // Read all municipality files
    const municipalityFiles = readdirSync(statePath)
      .filter(f => f.startsWith('municipality_') && f.endsWith('.json'))
      .sort();

    let muniCount = 0;

    for (const muniFile of municipalityFiles) {
      const muniPath = join(statePath, muniFile);
      const muni = JSON.parse(readFileSync(muniPath, 'utf8'));

      const municipality = muni.municipality;
      const municipalityCode = muni.municipalityCode;

      // Find the table with locality data (usually index 1)
      let localityTable = null;
      for (const table of muni.tables || []) {
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

      muniCount++;
    }

    totalMunicipalities += muniCount;
    console.log(`  ✓ Processed ${muniCount} municipalities`);
  }

  // Write to file
  writeFileSync(OUTPUT_FILE, csvRows.join('\n'), 'utf8');

  console.log(`\n✅ CSV created: ${OUTPUT_FILE}`);
  console.log(`📊 Total municipalities: ${totalMunicipalities}`);
  console.log(`📊 Total data rows: ${totalRows} (+ 1 header)`);
}

jsonToCSV();

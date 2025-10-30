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
  return str.replace(/,/g, '');
}

// Helper: Parse table data into rows
function parseTableData(tableData) {
  const rows = [];

  // Find which sub-array has the clean data
  // Usually it's the one that's a flat array of cells
  let flatData = null;

  for (const item of tableData) {
    if (Array.isArray(item) && item.length > 6) {
      // This looks like the flat array with all cells
      flatData = item;
      break;
    }
  }

  if (!flatData) return rows;

  // Skip header rows (they contain "Localidad", "Escuelas", etc.)
  // Start after we find the header
  let dataStartIndex = 0;
  for (let i = 0; i < flatData.length; i++) {
    if (flatData[i] === 'Localidad' || flatData[i].includes('Localidad')) {
      dataStartIndex = i + 6; // Skip the 6 header cells
      break;
    }
  }

  // Now parse every 6 elements as one row
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

  // Read all JSON files
  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} JSON files\n`);

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

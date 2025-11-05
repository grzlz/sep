import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const DATA_DIR = './data-by-level';
const OUTPUT_PREFIX = './output';

// Helper: Escape CSV values
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Helper: Clean number strings
function cleanNumber(str) {
  if (!str) return '';
  return String(str).replace(/,/g, '');
}

// Parse locality table data - handles variable column counts
function parseLocalityTable(tableData, educationLevel, controlType) {
  const rows = [];

  // Find the data table (skip form tables)
  let dataTable = null;
  for (const table of tableData) {
    // Look for table with locality data
    const tableStr = JSON.stringify(table.data).substring(0, 500);
    if ((tableStr.includes('Localidad') || tableStr.includes('LOCALIDAD')) &&
        table.columnCount > 5) {
      dataTable = table;
      break;
    }
  }

  if (!dataTable) {
    return { headers: [], rows: [] };
  }

  // Extract data rows
  const allData = dataTable.data;
  let headers = [];
  let headerRowIndex = -1;

  // Find header row
  for (let i = 0; i < allData.length; i++) {
    const row = allData[i];
    if (Array.isArray(row) &&
        (row.includes('Localidad') || row.includes('LOCALIDAD')) &&
        row.length > 5) {
      headers = row.map(h => h.trim());
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return { headers: [], rows: [] };
  }

  // Parse data rows
  for (let i = headerRowIndex + 1; i < allData.length; i++) {
    const row = allData[i];

    if (!Array.isArray(row) || row.length !== headers.length) {
      continue;
    }

    const firstCell = row[0];

    // Stop at TOTAL row or footnotes
    if (!firstCell ||
        firstCell.includes('TOTAL') ||
        firstCell.includes('¹') ||
        firstCell.includes('Fuente:') ||
        firstCell.includes('Conjunto de individuos')) {
      break;
    }

    // Create row object with all columns
    const rowObj = {};
    headers.forEach((header, idx) => {
      rowObj[header] = cleanNumber(row[idx]);
    });

    rows.push(rowObj);
  }

  return { headers, rows };
}

function convertToCSV() {
  console.log('🔄 Converting detailed JSON to CSV...\n');

  // Read all state directories
  const stateDirs = readdirSync(DATA_DIR).filter(name => {
    const fullPath = join(DATA_DIR, name);
    return statSync(fullPath).isDirectory();
  });

  console.log(`Processing ${stateDirs.length} state(s)\n`);

  // Group files by education level
  const filesByLevel = {};

  // Scan all files
  for (const stateDir of stateDirs) {
    const statePath = join(DATA_DIR, stateDir);

    // Read meta.json
    const metaPath = join(statePath, 'meta.json');
    let stateName = stateDir;
    let stateCode = '';

    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      stateName = meta.state;
      stateCode = meta.stateCode;
    } catch (err) {
      console.log(`  ⚠️  Could not read meta.json for ${stateDir}`);
    }

    // Read all municipality files
    const muniFiles = readdirSync(statePath)
      .filter(f => f.startsWith('muni_') && f.endsWith('.json'))
      .sort();

    for (const muniFile of muniFiles) {
      const muniPath = join(statePath, muniFile);

      // Parse filename to extract education level
      // Format: muni_001_secundaria_todos.json
      const parts = muniFile.replace('.json', '').split('_');
      const educationLevel = parts[2] || 'unknown';
      const controlType = parts[3] || 'unknown';

      // Initialize array for this level if needed
      if (!filesByLevel[educationLevel]) {
        filesByLevel[educationLevel] = [];
      }

      filesByLevel[educationLevel].push({
        path: muniPath,
        stateName,
        stateCode,
        educationLevel,
        controlType
      });
    }
  }

  // Process each education level separately
  console.log(`\nFound ${Object.keys(filesByLevel).length} education level(s):\n`);

  for (const [level, files] of Object.entries(filesByLevel)) {
    console.log(`Processing: ${level} (${files.length} files)`);

    // Collect all unique headers across all files for this level
    const allHeaders = new Set(['State', 'StateCode', 'Municipality', 'MunicipalityCode', 'EducationLevel', 'ControlType']);
    const allRows = [];

    // First pass: collect all headers
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(file.path, 'utf8'));
        const { headers } = parseLocalityTable(data.tables, file.educationLevel, file.controlType);

        headers.forEach(h => allHeaders.add(h));
      } catch (error) {
        console.log(`  ⚠️  Error reading ${file.path}: ${error.message}`);
      }
    }

    const headerArray = Array.from(allHeaders);

    // Second pass: extract data
    let totalLocalidades = 0;

    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(file.path, 'utf8'));
        const { rows } = parseLocalityTable(data.tables, file.educationLevel, file.controlType);

        for (const row of rows) {
          const csvRow = {};

          // Add metadata columns
          csvRow['State'] = file.stateName;
          csvRow['StateCode'] = file.stateCode;
          csvRow['Municipality'] = data.municipality;
          csvRow['MunicipalityCode'] = data.municipalityCode;
          csvRow['EducationLevel'] = file.educationLevel;
          csvRow['ControlType'] = file.controlType;

          // Add all data columns (fill missing with empty string)
          headerArray.forEach(header => {
            if (header in row) {
              csvRow[header] = row[header];
            } else if (!['State', 'StateCode', 'Municipality', 'MunicipalityCode', 'EducationLevel', 'ControlType'].includes(header)) {
              csvRow[header] = '';
            }
          });

          allRows.push(csvRow);
          totalLocalidades++;
        }
      } catch (error) {
        console.log(`  ⚠️  Error processing ${file.path}: ${error.message}`);
      }
    }

    // Write CSV file for this level
    if (allRows.length > 0) {
      const csvLines = [];

      // Header
      csvLines.push(headerArray.map(escapeCSV).join(','));

      // Data rows
      for (const row of allRows) {
        const line = headerArray.map(header => escapeCSV(row[header] || '')).join(',');
        csvLines.push(line);
      }

      const outputFile = `${OUTPUT_PREFIX}-${level}.csv`;
      writeFileSync(outputFile, csvLines.join('\n'), 'utf8');

      console.log(`  ✅ Created: ${outputFile}`);
      console.log(`     ${allRows.length} localities, ${headerArray.length} columns\n`);
    } else {
      console.log(`  ⚠️  No data found for ${level}\n`);
    }
  }

  console.log('✨ Conversion complete!');
}

convertToCSV();

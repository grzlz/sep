# How to Get Detailed Education Data (33 Columns)

## The Problem

The current `data.csv` has only 10 columns because the scraper queried with default filters ("Todos" = All education levels combined). This gives aggregated summary data.

To get the detailed 33-column table with grade-level breakdowns, you need to query **specific education levels** separately.

## Quick Start

### Step 1: Discover Dropdown Values

1. Open https://www.planeacion.sep.gob.mx/principalescifras/ in your browser
2. Open browser DevTools (F12) and go to the "Elements" or "Inspector" tab
3. Find the education level dropdown (look for select elements like `DDLNivelEducativo`, `DDLTipoEducativo`, etc.)
4. Note the **name** attribute and **option values**

Example:
```html
<select name="DDLNivelEducativo">
  <option value="0">Todos</option>
  <option value="02">Preescolar</option>
  <option value="03">Primaria</option>
  <option value="04">Secundaria</option>
  <option value="07">Media Superior</option>
</select>
```

### Step 2: Update Scraper Configuration

Edit `scraper-by-level.js`:

1. Update `EDUCATION_LEVELS` array (lines 28-40) with the correct values:
   ```javascript
   const EDUCATION_LEVELS = [
     { name: 'Secundaria', nivelValue: '04' },  // Use actual value from step 1
     { name: 'Primaria', nivelValue: '03' },
     // ... etc
   ];
   ```

2. Update `CONTROL_TYPES` array (lines 42-46) if needed:
   ```javascript
   const CONTROL_TYPES = [
     { name: 'Todos', value: '0' },
     { name: 'Público', value: '1' },  // Verify this value!
     { name: 'Privado', value: '2' },
   ];
   ```

3. Verify `DROPDOWN_NAMES` (lines 49-57) match the website:
   ```javascript
   const DROPDOWN_NAMES = {
     state: 'DDLEntidad',
     municipality: 'DDLMunicipio',
     nivel: 'DDLNivelEducativo',  // Verify this exists!
     // ... etc
   };
   ```

### Step 3: Test with One State

Edit `scraper-by-level.js` line 276 to uncomment the test mode:
```javascript
const testStates = [states[0]];  // Just test Aguascalientes
```

Then run:
```bash
cd sep-scraper
node scraper-by-level.js
```

### Step 4: Verify Results

Check the output:
```bash
ls data-by-level/aguascalientes/

# You should see files like:
# muni_001_secundaria_todos.json
# muni_001_secundaria_publico.json
# muni_001_primaria_todos.json
# etc.
```

Open one of the JSON files and check:
- Does the table have more than 6 columns?
- Do you see grade-level breakdowns (1°, 2°, 3°)?
- Does it match the structure you expect?

### Step 5: Run Full Scrape

If the test looks good, comment out the test mode line and run for all states:
```bash
node scraper-by-level.js
```

This will take several hours as it queries:
- 32 states
- ~50-100 municipalities per state (varies)
- 4 education levels
- 3 control types (Todos, Público, Privado)
- = ~20,000+ queries total

### Step 6: Convert to CSV

Once scraping is complete, run the CSV converter:
```bash
node json-to-csv-detailed.js
```

This will create multiple CSV files:
- `output-secundaria.csv` - All Secundaria data
- `output-primaria.csv` - All Primaria data
- etc.

## Troubleshooting

### SSL Certificate Error

If you get `ERR_CERT_AUTHORITY_INVALID`:
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 node scraper-by-level.js
```

### 403 Forbidden

The website may be blocking automated requests. Try:
1. Add delays between requests (already included)
2. Change the user agent
3. Run during off-peak hours
4. Use a VPN if geo-blocked

### Wrong Column Count

If you're still getting 6 columns instead of 30+:
- The dropdown values are wrong
- The education level filter isn't being applied
- The website structure changed

Solution: Manually test the website and verify the form values.

### Dropdown Not Found

If you get errors like "Cannot select option":
- The dropdown name is wrong
- It's a cascading dropdown that requires setting a parent first
- The website uses JavaScript to show/hide dropdowns

Solution: Use browser DevTools to inspect the actual form structure.

## Alternative Approaches

### Approach 1: Manual CSV Export

If scraping is too difficult:
1. Manually select filters on the website
2. Copy the table data
3. Paste into Excel/Google Sheets
4. Export as CSV
5. Repeat for each combination...

(This is tedious but guaranteed to work)

### Approach 2: Use Existing Data + Manual Queries

For the specific combinations you need most:
1. Identify which level gives you the 33 columns (likely Secundaria)
2. Query only that level
3. Skip the others for now

### Approach 3: Contact SEP for Data Export

The SEP may provide bulk data exports. Check:
- https://www.gob.mx/sep/acciones-y-programas/datos-abiertos-de-educacion
- Email: datosabiertos@sep.gob.mx

## Need Help?

If you're stuck:
1. Share a screenshot of the website form with dropdowns visible
2. Share the HTML of one of the select elements (right-click → "Inspect")
3. Share any error messages you're getting

Then I can provide more specific guidance.

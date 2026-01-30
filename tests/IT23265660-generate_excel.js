const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Load test cases from test-data.json
const testDataPath = path.join(__dirname, 'test-data.json');
const testCases = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

// Try to load test results from Playwright JSON report if available
let testResults = {};
const resultsPath = path.join(__dirname, '..', 'test-results', '.last-run.json');

try {
    if (fs.existsSync(resultsPath)) {
        const lastRun = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
        // Map results by test name
        if (lastRun.suites) {
            for (const suite of lastRun.suites) {
                if (suite.specs) {
                    for (const spec of suite.specs) {
                        testResults[spec.title] = spec.ok ? 'PASS' : 'FAIL';
                    }
                }
            }
        }
    }
} catch (error) {
    console.log('Note: Could not load test results, status will be marked as "Not Run"');
}

// Prepare data for Excel
const excelData = testCases.map((tc, index) => {
    // Try to find matching test result
    const testTitle = `${tc.id}: ${tc.description || tc.singlish} → ${tc.expectedSinhala}`;
    const status = testResults[testTitle] || 'Not Run';

    return {
        'Test Case ID': tc.id,
        'Category': tc.category || 'General',
        'Singlish Input': tc.singlish,
        'Expected Sinhala Output': tc.expectedSinhala,
        'Description': tc.description || '',
        'Status': status
    };
});

// Add summary row
const passCount = excelData.filter(row => row.Status === 'PASS').length;
const failCount = excelData.filter(row => row.Status === 'FAIL').length;
const notRunCount = excelData.filter(row => row.Status === 'Not Run').length;

// Create workbook and worksheet
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(excelData);

// Set column widths
ws['!cols'] = [
    { wch: 12 },  // Test Case ID
    { wch: 15 },  // Category
    { wch: 25 },  // Singlish Input
    { wch: 30 },  // Expected Sinhala Output
    { wch: 35 },  // Description
    { wch: 10 }   // Status
];

// Add worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');

// Create summary sheet
const summaryData = [
    { 'Metric': 'Total Test Cases', 'Value': testCases.length },
    { 'Metric': 'Passed', 'Value': passCount },
    { 'Metric': 'Failed', 'Value': failCount },
    { 'Metric': 'Not Run', 'Value': notRunCount },
    { 'Metric': 'Pass Rate', 'Value': testCases.length > 0 ? `${((passCount / testCases.length) * 100).toFixed(1)}%` : 'N/A' },
    { 'Metric': 'Generated On', 'Value': new Date().toISOString() }
];

const summaryWs = XLSX.utils.json_to_sheet(summaryData);
summaryWs['!cols'] = [{ wch: 20 }, { wch: 25 }];
XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

// Write the Excel file
const outputPath = path.join(__dirname, '..', 'results.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`\n✅ Excel report generated successfully!`);
console.log(`📄 File: ${outputPath}`);
console.log(`\n📊 Summary:`);
console.log(`   Total Test Cases: ${testCases.length}`);
console.log(`   Passed: ${passCount}`);
console.log(`   Failed: ${failCount}`);
console.log(`   Not Run: ${notRunCount}`);

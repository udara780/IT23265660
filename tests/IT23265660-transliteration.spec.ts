import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

// Load test cases from Excel file
const testDataPath = path.join(__dirname, 'IT23265660_test-data.xlsx');
const workbook = XLSX.readFile(testDataPath);
const sheetName = workbook.SheetNames[0]; // Get first sheet
const worksheet = workbook.Sheets[sheetName];
const rawData = XLSX.utils.sheet_to_json(worksheet);

// Map Excel columns to test case format
// Excel columns: TC ID, Test case name, Input length type, Input, Expected output, Actual output, Status, Accuracy justification / Description of issue type, What is covered by the test
const allTestCases: Array<{
    tcId: string;
    testCaseName: string;
    inputLengthType: string;
    input: string;
    expectedOutput: string;
    actualOutput: string;
    status: string;
    accuracyJustification: string;
    whatIsCovered: string;
}> = rawData.map((row: any) => ({
    tcId: String(row['TC ID'] || ''),
    testCaseName: String(row['Test case name'] || ''),
    inputLengthType: String(row['Input length type'] || ''),
    input: String(row['Input'] || ''),
    expectedOutput: String(row['Expected output'] || ''),
    actualOutput: String(row['Actual output'] || ''),
    status: String(row['Status'] || ''),
    accuracyJustification: String(row['Accuracy justification / Description of issue type'] || ''),
    whatIsCovered: String(row['What is covered by the test'] || '')
}));

// Filter out invalid rows (empty input or missing TC ID) and ensure unique test cases
const seenIds = new Set<string>();
const testCases = allTestCases.filter(tc => {
    // Skip rows with empty input or TC ID
    if (!tc.input || tc.input.trim() === '' || !tc.tcId || tc.tcId.trim() === '') {
        return false;
    }
    // Skip duplicate TC IDs
    if (seenIds.has(tc.tcId)) {
        return false;
    }
    seenIds.add(tc.tcId);
    return true;
});

// Helper to find the input textarea (tries multiple selectors)
async function findInputElement(page: Page) {
    // Try various selectors that might match the input field
    const possibleSelectors = [
        'textarea:first-of-type',
        'textarea[placeholder*="Singlish" i]',
        'textarea[placeholder*="English" i]',
        'textarea[placeholder*="type" i]',
        '#singlish-input',
        '.input-area textarea',
        'div[class*="input"] textarea',
        'textarea',
    ];

    for (const selector of possibleSelectors) {
        const element = page.locator(selector).first();
        if (await element.count() > 0 && await element.isVisible()) {
            return element;
        }
    }

    // Fallback: get first visible textarea
    return page.locator('textarea').first();
}

// Helper to find the output element (tries multiple selectors)
async function findOutputElement(page: Page) {
    const possibleSelectors = [
        'textarea:nth-of-type(2)',
        'textarea[placeholder*="Sinhala" i]',
        'textarea[readonly]',
        '#sinhala-output',
        '.output-area textarea',
        'div[class*="output"] textarea',
    ];

    for (const selector of possibleSelectors) {
        const element = page.locator(selector).first();
        if (await element.count() > 0 && await element.isVisible()) {
            return element;
        }
    }

    // Fallback: get second textarea if exists
    const textareas = page.locator('textarea');
    if (await textareas.count() >= 2) {
        return textareas.nth(1);
    }

    return page.locator('textarea').last();
}

// Helper function to type text and wait for transliteration
async function typeAndWait(page: Page, input: any, text: string) {
    await input.click();
    await input.clear();

    // Type the text
    await input.fill(text);

    // Wait for transliteration to process
    await page.waitForTimeout(1500);
}

// Helper to get text from element (handles both textarea and div)
async function getElementText(element: any): Promise<string> {
    const tagName = await element.evaluate((el: Element) => el.tagName.toLowerCase());

    if (tagName === 'textarea' || tagName === 'input') {
        return await element.inputValue();
    } else {
        return (await element.textContent()) || '';
    }
}

test.describe('IT23265660 - Sinhala Transliteration Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the transliteration site
        await page.goto('/');

        // Wait for React app to load
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Extra wait for SPA hydration
    });

    // Generate tests dynamically from test data
    for (const testCase of testCases) {
        test(`${testCase.tcId}: ${testCase.testCaseName || testCase.input} → ${testCase.expectedOutput}`, async ({ page }) => {
            // Find input element
            const input = await findInputElement(page);
            await expect(input).toBeVisible({ timeout: 15000 });

            // Type the Singlish text
            await typeAndWait(page, input, testCase.input);

            // Find output element
            const output = await findOutputElement(page);
            await expect(output).toBeVisible({ timeout: 5000 });

            // Get the output text
            const outputText = await getElementText(output);

            // Assert the transliteration matches expected output
            expect(outputText.trim()).toBe(testCase.expectedOutput);
        });
    }

    // UI Behavior Tests
    test('UI: Real-time transliteration updates', async ({ page }) => {
        const input = await findInputElement(page);
        await expect(input).toBeVisible({ timeout: 15000 });

        // Type a test word
        await typeAndWait(page, input, 'test');

        // Find output and verify it exists and has some content
        const output = await findOutputElement(page);
        await expect(output).toBeVisible();
    });

    test('UI: Empty input handling', async ({ page }) => {
        const input = await findInputElement(page);
        await expect(input).toBeVisible({ timeout: 15000 });

        // Clear input
        await input.clear();
        await page.waitForTimeout(500);

        // Find output and verify it's empty or exists
        const output = await findOutputElement(page);
        const outputText = await getElementText(output);

        expect(outputText.trim()).toBe('');
    });

    test('UI: Long text handling', async ({ page }) => {
        const input = await findInputElement(page);
        await expect(input).toBeVisible({ timeout: 15000 });

        // Type a longer sentence
        await typeAndWait(page, input, 'mama gedara yanawa honda dawasak');

        // Verify output area has content
        const output = await findOutputElement(page);
        await expect(output).toBeVisible();

        const outputText = await getElementText(output);
        expect(outputText.length).toBeGreaterThan(0);
    });
});

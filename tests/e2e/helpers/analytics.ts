import { expect, type Page } from '@playwright/test';

export interface RecordedEvent {
  eventName: string;
  eventData: Record<string, any>;
  timestamp: string;
}

/**
 * Setup analytics mocking for a Playwright page
 * - Blocks real GA network requests to Google
 * - Records all gtag calls for verification
 * - Prevents external calls during test execution
 */
export async function setupAnalyticsMocking(page: Page): Promise<void> {
  // Block real GA requests to Google
  await page.route('**/googletagmanager.com/**', (route) => {
    route.abort();
  });

  await page.route('**/google-analytics.com/**', (route) => {
    route.abort();
  });

  // Initialize event recording
  await page.evaluateHandle(() => {
    (window as any).gtagEvents = [];
    (window as any).gtagCalls = [];

    // Store reference to original gtag
    const originalGtag = (window as any).gtag;

    // Override gtag to record calls
    (window as any).gtag = function (...args: any[]) {
      (window as any).gtagCalls.push({
        timestamp: new Date().toISOString(),
        args: JSON.parse(JSON.stringify(args)),
      });

      if (args[0] === 'event') {
        (window as any).gtagEvents.push({
          eventName: args[1],
          eventData: args[2] || {},
          timestamp: new Date().toISOString(),
        });
      }

      if (typeof originalGtag === 'function') {
        return originalGtag.apply(this, args as any);
      }
    };
  });
}

/**
 * Get all recorded analytics events from the current page
 */
export async function getRecordedEvents(page: Page): Promise<RecordedEvent[]> {
  return page.evaluate(() => (window as any).gtagEvents || []);
}

/**
 * Get all recorded gtag calls (including config calls)
 */
export async function getAllGtagCalls(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).gtagCalls || []);
}

/**
 * Verify that an event was tracked with optional parameter matching
 * @param page Playwright page object
 * @param eventName The event name to search for
 * @param expectedParams Optional parameters to match
 */
export async function expectEventTracked(
  page: Page,
  eventName: string,
  expectedParams?: Record<string, any>
): Promise<void> {
  const events = await getRecordedEvents(page);
  const matchingEvent = events.find((e) => e.eventName === eventName);

  expect(matchingEvent).toBeDefined();

  if (expectedParams && matchingEvent) {
    Object.entries(expectedParams).forEach(([key, value]) => {
      expect(matchingEvent.eventData[key]).toBe(value);
    });
  }
}

/**
 * Clear all recorded events
 */
export async function clearRecordedEvents(page: Page): Promise<void> {
  await page.evaluateHandle(() => {
    (window as any).gtagEvents = [];
    (window as any).gtagCalls = [];
  });
}

/**
 * Wait for a specific event to be tracked
 */
export async function waitForEvent(
  page: Page,
  eventName: string,
  timeout = 5000
): Promise<RecordedEvent> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const events = await getRecordedEvents(page);
    const event = events.find((e) => e.eventName === eventName);

    if (event) {
      return event;
    }

    await page.waitForTimeout(100);
  }

  const recordedEvents = await getRecordedEvents(page);
  throw new Error(
    `Event "${eventName}" was not tracked within ${timeout}ms. ` +
      `Recorded events: ${recordedEvents.map((e) => e.eventName).join(', ')}`
  );
}

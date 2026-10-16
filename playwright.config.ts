import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// 서버와 테스트 워커 모두 .env.local의 값을 쓴다(DATABASE_URL, SESSION_SECRET 등). 값은 출력하지 않는다.
config({ path: ".env.local", quiet: true });

const PORT = 3123;
const baseURL = `http://localhost:${PORT}`;

// 실행 전에 `npm run build`가 필요하다. 예: npm run build && npm run e2e
export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone-13", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: `npm start -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)),
  },
});

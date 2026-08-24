import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing-library's automatic cleanup keys off injected globals, which this
// config deliberately does not enable — so without this line every render
// accumulates in one document and "found multiple elements" failures appear
// in whichever test runs second.
afterEach(cleanup);

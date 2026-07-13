import Papa from "papaparse";

export async function loadCsv(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load data file: ${path}`);
  }

  const csvText = await response.text();
  return parseCsvText(csvText, path);
}

export function parseCsvText(csvText, label = "uploaded CSV") {
  const parsed = Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new Error(`CSV parse error in ${label}: ${firstError.message}`);
  }

  return parsed.data;
}

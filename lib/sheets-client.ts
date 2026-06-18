// Cliente Sheets genérico que acepta el spreadsheet ID por parámetro.
// Permite consultar múltiples archivos (Tareas, _Consorcios externo) con la misma SA.
import { google, sheets_v4 } from "googleapis";
import { getGoogleAuth } from "./google-auth";

let sheetsClient: sheets_v4.Sheets | null = null;

function getSheets(): sheets_v4.Sheets {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: "v4", auth: getGoogleAuth() });
  }
  return sheetsClient;
}

export async function readRangeFromSpreadsheet(
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values ?? []) as string[][];
}

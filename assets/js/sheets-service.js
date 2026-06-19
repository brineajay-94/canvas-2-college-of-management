/**
 * Google Sheets Web App client service.
 * Communicates with the Apps Script web app deployed from code.gs.
 *
 * Usage:
 *   sheetsService.setWebAppUrl('https://script.google.com/.../exec');
 *   const result = await sheetsService.fetchResult(sheetName, symbolNumber);
 *   const all = await sheetsService.getAllData(sheetName);
 *   await sheetsService.addOrUpdateRow(sheetName, dataArray);
 */

const sheetsService = {
  _webAppUrl: '',

  setWebAppUrl(url) {
    this._webAppUrl = url.replace(/\/$/, '');
  },

  getWebAppUrl() {
    return this._webAppUrl;
  },

  async _get(params) {
    if (!this._webAppUrl) throw new Error('Web App URL not set. Add it in the admin Sheet panel.');
    // Add cache-busting param to prevent Google Apps Script from caching GET responses
    params._ = Date.now();
    const qs = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    const res = await fetch(this._webAppUrl + '?' + qs);
    return res.json();
  },

  async _post(body) {
    if (!this._webAppUrl) throw new Error('Web App URL not set.');
    // Use ? suffix to avoid GAS redirect losing POST body
    const url = this._webAppUrl + '?';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body)
    });
    return res.json();
  },

  /** List all sheet/tab names in the spreadsheet */
  async listSheets(sheetId) {
    const params = { action: 'listSheets' };
    if (sheetId) params.sheetId = sheetId;
    const res = await this._get(params);
    if (res.error) throw new Error(res.error);
    return res.sheets || [];
  },

  /** Fetch a single student result by symbol number */
  async fetchResult(sheetName, symbolNumber, sheetId) {
    const params = { sheet: sheetName, symbolNumber: String(symbolNumber) };
    if (sheetId) params.sheetId = sheetId;
    const res = await this._get(params);
    if (res.error) throw new Error(res.error);
    return res;
  },

  /** Get all rows from a sheet */
  async getAllData(sheetName, sheetId) {
    const params = { sheet: sheetName, action: 'all' };
    if (sheetId) params.sheetId = sheetId;
    const res = await this._get(params);
    if (res.error) throw new Error(res.error);
    return res;
  },

  /** Add or update a row. Uses symbol column (default index 0) to match existing. */
  async addOrUpdateRow(sheetName, dataArray, symbolColumn, sheetId) {
    const body = {
      sheet: sheetName,
      data: dataArray,
      symbolColumn: symbolColumn || 0
    };
    if (sheetId) body.sheetId = sheetId;
    const res = await this._post(body);
    if (res.error) throw new Error(res.error);
    return res;
  }
};

export type ProxyResponse =
  | { success: true; data: any; status?: number; isRaw?: boolean }
  | { success: false; error: string; status?: number }

export type FetchProxy = (url: string, options: any) => Promise<ProxyResponse>

export const backgroundFetchProxy: FetchProxy = (url, options) =>
  chrome.runtime.sendMessage({ type: "FETCH_API", url, options })

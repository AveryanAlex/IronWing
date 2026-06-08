export async function openBrowserUrl(url: string): Promise<void> {
  window.open(url, "_blank", "noopener,noreferrer");
}

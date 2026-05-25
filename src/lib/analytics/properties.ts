export function countBucket(count: number): string {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2_5";
  if (count <= 20) return "6_20";
  if (count <= 100) return "21_100";
  return "101_plus";
}

export function durationBucket(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "unknown";
  if (seconds < 10) return "under_10s";
  if (seconds < 60) return "10_59s";
  if (seconds < 300) return "1_5m";
  if (seconds < 1800) return "5_30m";
  if (seconds < 7200) return "30m_2h";
  return "2h_plus";
}

export function sizeBucket(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < 1024 * 1024) return "under_1mb";
  if (bytes < 10 * 1024 * 1024) return "1_10mb";
  if (bytes < 100 * 1024 * 1024) return "10_100mb";
  if (bytes < 1024 * 1024 * 1024) return "100mb_1gb";
  return "1gb_plus";
}

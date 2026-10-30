/** Origins used by the storage client's direct browser uploads. No credentials enter CSP. */
export function storageConnectOrigins(env: Record<string, string | undefined>): string[] {
  if (env.S3_ENDPOINT) {
    const endpoint = new URL(env.S3_ENDPOINT);
    if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      throw new Error("S3_ENDPOINT must be an HTTP(S) URL without credentials");
    }
    return [endpoint.origin]; // Custom endpoints use forcePathStyle in the S3 client.
  }
  const bucket = env.S3_BUCKET_NAME || "skooleeai-reports";
  const region = env.S3_REGION || "us-east-1";
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket) || !/^[a-z0-9-]+$/.test(region)) {
    throw new Error("Invalid S3 bucket name or region");
  }
  const domain = region.startsWith("cn-") ? "amazonaws.com.cn" : "amazonaws.com";
  // Dotted bucket names use path addressing to avoid TLS wildcard mismatches.
  return [bucket.includes(".") ? `https://s3.${region}.${domain}` : `https://${bucket}.s3.${region}.${domain}`];
}

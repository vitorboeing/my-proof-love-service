import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const bucket = process.env.S3_BUCKET_NAME;
const region = process.env.S3_REGION || 'us-east-1';

export const s3Client =
  bucket && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? new S3Client({
        region,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        },
      })
    : null;

export function isS3Configured(): boolean {
  return s3Client !== null && !!bucket;
}

/**
 * Upload a buffer to S3 and return the public URL.
 * Key format: moments/{momentId}/{timestamp}-{random}.{ext}
 */
export async function uploadToS3(params: {
  momentId: string;
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
}): Promise<string> {
  if (!s3Client || !bucket) {
    throw new Error('S3 is not configured');
  }

  const { momentId, buffer, originalName, mimeType } = params;
  const ext = originalName.includes('.')
    ? originalName.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')
    : 'bin';
  const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'mp3', 'wav'].includes(ext)
    ? ext
    : 'bin';
  const key = `moments/${momentId}/${Date.now()}-${Math.round(Math.random() * 1e9)}.${safeExt}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType || undefined,
    })
  );

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * Delete an object from S3 by its full URL.
 * Only works for URLs in format https://{bucket}.s3.{region}.amazonaws.com/{key}
 */
export async function deleteFromS3ByUrl(url: string): Promise<void> {
  if (!s3Client || !bucket) return;

  try {
    const u = new URL(url);
    const prefix = `https://${bucket}.s3.`;
    if (!url.startsWith(prefix) || !u.hostname.endsWith('.amazonaws.com')) return;

    const key = u.pathname.slice(1); // remove leading /
    if (!key) return;

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: decodeURIComponent(key),
      })
    );
  } catch (err) {
    console.error('S3 delete error:', err);
  }
}

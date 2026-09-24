import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

async function toNodeBody(body) {
  if (body == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(body) || typeof body === 'string' || body instanceof Uint8Array) return body;
  if (body instanceof ReadableStream || body instanceof Readable) {
    const stream = body instanceof ReadableStream ? Readable.fromWeb(body) : body;
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  return body;
}

export function createR2Adapter(env, options = {}) {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) return null;
  const client = options.client || new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  return {
    supportsHttpRange: true,
    async put(key, body, options = {}) {
      const payload = await toNodeBody(body);
      const contentLength = Number.isFinite(Number(options.contentLength))
        ? Number(options.contentLength)
        : typeof payload === 'string' ? Buffer.byteLength(payload) : Number(payload?.byteLength ?? payload?.length);
      await client.send(new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: payload,
        ContentType: options.httpMetadata?.contentType || 'application/octet-stream',
        ContentLength: Number.isFinite(contentLength) ? contentLength : undefined,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      return { key };
    },
    async get(key, options = {}) {
      try {
        const range = /^bytes=\d*-\d*$/.test(String(options?.rangeHeader || ''))
          ? String(options.rangeHeader)
          : undefined;
        const result = await client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key, Range: range }));
        const body = result.Body?.transformToWebStream ? result.Body.transformToWebStream() : result.Body;
        return {
          body,
          httpMetadata: { contentType: result.ContentType || 'application/octet-stream' },
          etag: result.ETag,
          contentLength: Number(result.ContentLength),
          contentRange: result.ContentRange || '',
          acceptRanges: result.AcceptRanges || 'bytes',
        };
      } catch (error) {
        const status = error?.$metadata?.httpStatusCode;
        if (status === 404 || error?.name === 'NoSuchKey' || error?.name === 'NotFound') return null;
        throw error;
      }
    },
    async head(key) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
        return {
          httpMetadata: { contentType: result.ContentType || 'application/octet-stream' },
          etag: result.ETag,
          contentLength: Number(result.ContentLength),
        };
      } catch (error) {
        const status = error?.$metadata?.httpStatusCode;
        if (status === 404 || error?.name === 'NoSuchKey' || error?.name === 'NotFound') return null;
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
      return true;
    },
    async health() {
      await client.send(new HeadBucketCommand({ Bucket: env.R2_BUCKET_NAME }));
      return true;
    },
  };
}

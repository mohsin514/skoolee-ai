# Configure private S3 storage

Skoolee uses the same S3 bucket and credentials for profile images, school and
campus logos, admission and staff documents, report PDFs, chat attachments, and
the original files attached to School AI workflows. School AI originals use
the private `school-ai/{schoolId}/{uuid}` object-key prefix. They are read only
through authenticated application routes and are not served from the public
media route.

## 1. Create a private bucket

In AWS S3, create a bucket in the region closest to the application and its
users. Keep **Block all public access** enabled, disable ACLs with
**Bucket owner enforced**, and enable default server-side encryption (SSE-S3 or
SSE-KMS). Enable versioning if your retention and recovery policy requires it.
Do not add public-read bucket policies or website hosting. Use separate buckets
for production and non-production where possible.

If uploads come directly from a browser to S3, add a narrow CORS rule for the
exact Skoolee origins that upload files. Allow `PUT`, `GET`, and `HEAD`, and the
request header `Content-Type`; expose `ETag` only if the client needs it. Do
not use `*` as the allowed origin in production. The application still
validates file type, size, membership, and permissions before issuing a
short-lived upload URL.

## 2. Create a restricted IAM identity

Create an IAM user or role dedicated to Skoolee. Grant it only the operations
the app uses on objects in this bucket; it does not need bucket administration
or `s3:ListAllMyBuckets`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::YOUR_BUCKET_NAME/student-docs/*",
        "arn:aws:s3:::YOUR_BUCKET_NAME/staff-docs/*",
        "arn:aws:s3:::YOUR_BUCKET_NAME/reports/*",
        "arn:aws:s3:::YOUR_BUCKET_NAME/chat/*",
        "arn:aws:s3:::YOUR_BUCKET_NAME/profile-images/*",
        "arn:aws:s3:::YOUR_BUCKET_NAME/logos/*",
        "arn:aws:s3:::YOUR_BUCKET_NAME/school-ai/*"
      ]
    }
  ]
}
```

Replace `YOUR_BUCKET_NAME` with the bucket name. If using SSE-KMS, also grant
the identity only the KMS key operations required for encrypting and decrypting
objects. Store the generated access key securely; never commit it or place it
in a `NEXT_PUBLIC_*` variable.

## 3. Add Vercel environment variables

For each Skoolee application project that needs uploads, add the following as
encrypted **Secret** variables in Vercel. Select the environments intentionally
(Production for the production app; Preview/Development only for the relevant
test deployments):

| Variable | Value |
| --- | --- |
| `S3_BUCKET_NAME` | The bucket name, without an `s3://` prefix |
| `S3_ACCESS_KEY_ID` | The dedicated IAM access key ID |
| `S3_SECRET_ACCESS_KEY` | The matching secret access key |
| `S3_REGION` | The bucket's AWS region, for example `us-east-1` |
| `S3_ENDPOINT` | Optional; only for an S3-compatible service, not standard AWS S3 |

The application defaults the region to `us-east-1` if `S3_REGION` is omitted.
For AWS S3, leave `S3_ENDPOINT` unset. For S3-compatible providers, set their
endpoint and region as documented by that provider. Keep production credentials
separate from preview credentials. Do not copy database, Supabase, email, or
other local `.env` values as part of storage setup.

After saving environment variables, create a new deployment for those values to
take effect. Vercel does not inject newly added values into deployments that
are already running.

## 4. Verify before real school uploads

Use a non-production project and a disposable synthetic file first. Verify a
permitted upload, authenticated read, and delete; verify a user from another
school cannot read the source; and check that the object remains private in the
AWS console. Do not use student records as test data. Then repeat a read/write
smoke test in production with an approved, non-sensitive test file before
enabling school workflows. Confirm lifecycle, backup, and retention settings
match the school's policy before uploading real documents.

S3 configuration makes durable storage available. It does not by itself enable
School AI document processing or authorize student documents/audio to be sent
to an AI provider; that has a separate explicit media-egress setting.

#!/bin/sh
# Local S3-compatible object storage (SeaweedFS). Credentials come from the
# environment and are written to a config file inside the container only.
# Buckets are private: there is no anonymous identity, so every read needs a
# signed request or a short-lived presigned URL issued by the app.
set -e
umask 077
cat > /tmp/s3.json <<EOF
{
  "identities": [
    {
      "name": "cadencia-app",
      "credentials": [{ "accessKey": "${S3_ACCESS_KEY}", "secretKey": "${S3_SECRET_KEY}" }],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
    }
  ]
}
EOF
exec weed server -dir=/data -ip=127.0.0.1 -ip.bind=0.0.0.0 -master.volumeSizeLimitMB=1024 -volume.max=0 \
  -s3 -s3.port=8333 -s3.config=/tmp/s3.json

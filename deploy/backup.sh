#!/bin/bash
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
umask 077
BACKUP_DIR=/var/backups/kunci
BUCKET=kunci-group-erp-backups-20261116
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/backup.lock"
flock -n 9 || exit 0
stage=$(mktemp -d "$BACKUP_DIR/staging.XXXXXX")
trap 'case "$stage" in /var/backups/kunci/staging.*) rm -rf -- "$stage";; esac' EXIT
runuser -u postgres -- pg_dump -Fc kunci > "$stage/database.dump"
tar -cf "$stage/uploads.tar" -C /srv/kunci/app uploads
sha256sum "$stage/database.dump" "$stage/uploads.tar" | sed "s|$stage/||g" > "$stage/SHA256SUMS"
date -u +%FT%TZ > "$stage/created-at.txt"
archive="$BACKUP_DIR/kunci-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar -czf "$archive" -C "$stage" database.dump uploads.tar SHA256SUMS created-at.txt
python3 - "$archive" "$BUCKET" <<'PY'
import sys,json,hashlib,base64,os,http.client,urllib.request,urllib.parse
path,bucket=sys.argv[1:]
request=urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',headers={'Metadata-Flavor':'Google'})
with urllib.request.urlopen(request,timeout=10) as response: token=json.load(response)['access_token']
md5=hashlib.md5();sha=hashlib.sha256()
with open(path,'rb') as f:
    for block in iter(lambda:f.read(1024*1024),b''):md5.update(block);sha.update(block)
name='daily/'+os.path.basename(path)
url='/upload/storage/v1/b/'+bucket+'/o?uploadType=media&ifGenerationMatch=0&name='+urllib.parse.quote(name,safe='')
conn=http.client.HTTPSConnection('storage.googleapis.com',timeout=60)
conn.putrequest('POST',url);conn.putheader('Authorization','Bearer '+token);conn.putheader('Content-Type','application/gzip');conn.putheader('Content-Length',str(os.path.getsize(path)));conn.putheader('x-goog-meta-sha256',sha.hexdigest());conn.endheaders()
with open(path,'rb') as f:
    for block in iter(lambda:f.read(1024*1024),b''):conn.send(block)
response=conn.getresponse();body=response.read()
if response.status not in (200,201):raise RuntimeError('Private backup upload failed, HTTP '+str(response.status))
stored=json.loads(body)
if stored.get('md5Hash')!=base64.b64encode(md5.digest()).decode():raise RuntimeError('Stored backup integrity check failed')
print('PRIVATE_BACKUP_OK object='+name+' bytes='+str(os.path.getsize(path))+' sha256='+sha.hexdigest())
PY
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'kunci-*.tar.gz' -mtime +7 -delete

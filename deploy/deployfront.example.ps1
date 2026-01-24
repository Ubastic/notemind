echo "YOUR_PASSWORD"| plink -ssh -pw "YOUR_PASSWORD" root@YOUR_SERVER_IP "source /root/.nvm/nvm.sh && cd /var/www/note/frontend && NODE_OPTIONS=--max_old_space_size=200 /root/.nvm/versions/node/v16.20.2/bin/npm run build"
# Push-Location (Join-Path $PSScriptRoot "..\frontend")
# try {
#   npm run build
# } finally {
#   echo "YOUR_PASSWORD"| plink -ssh -pw "YOUR_PASSWORD" root@YOUR_SERVER_IP "cd /var/www/note/frontend && NODE_OPTIONS=--max_old_space_size=200 /root/.nvm/versions/node/v16.20.2/bin/npm run build"
#   Pop-Location
# }

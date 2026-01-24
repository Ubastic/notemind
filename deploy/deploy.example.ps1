echo "YOUR_PASSWORD"| plink -ssh -pw "YOUR_PASSWORD" root@YOUR_SERVER_IP "source /root/.nvm/nvm.sh && /root/.nvm/versions/node/v16.20.2/bin/pm2 restart notemind-api"
cd frontend
echo "YOUR_PASSWORD"| plink -ssh -pw "YOUR_PASSWORD" root@YOUR_SERVER_IP "source /root/.nvm/nvm.sh && NODE_OPTIONS=--max_old_space_size=200 npm run build"
#npm run build

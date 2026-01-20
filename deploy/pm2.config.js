module.exports = {
  apps: [
    {
      name: "notemind-api",
      cwd: "/var/www/note/backend",
      script: "/usr/bin/python3.7",
      args: "/usr/local/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001",
      env_file: "/var/www/note/backend/.env",
      env: {
        DATABASE_URL: "sqlite:///./notemind.db",
      },
    },
  ],
};
